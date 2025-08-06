import { LitElement, TemplateResult, html, css, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceCardConfig,
  BackgroundGraphEntitiesConfig,
  EntityConfig,
  ColorThreshold,
} from './types.js';
import { extent } from 'd3-array';
import { scaleLinear, scaleTime, ScaleLinear } from 'd3-scale';
import { select, Selection } from 'd3-selection';
import { line as d3Line, curveBasis, curveLinear, curveStep } from 'd3-shape';
import styles from './styles/card.styles.scss';

// Define the custom element name
const ELEMENT_NAME = 'background-graph-entities';

console.info(
  `%c BACKGROUND-GRAPH-ENTITIES %c v__CARD_VERSION__ `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

declare global {
  interface Window {
    customCards?: {
      type: string;
      name: string;
      description: string;
    }[];
  }
}

interface LovelaceCardHelpers {
  createCardElement(config: LovelaceCardConfig): Promise<LovelaceCard>;
}

interface CustomWindow extends Window {
  loadCardHelpers?: () => Promise<LovelaceCardHelpers>;
}

type LovelaceCardConstructor = {
  new (): LovelaceCard;
  getConfigElement(): Promise<LovelaceCardEditor>;
};

@customElement(ELEMENT_NAME)
export class BackgroundGraphEntities extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ type: Boolean, reflect: true }) public editMode = false;
  @state() private _config!: BackgroundGraphEntitiesConfig;
  @state() private _entities: EntityConfig[] = [];
  @state() private _history: Map<string, { timestamp: Date; value: number }[]> = new Map();
  private _historyFetched = false;
  private _timerId?: number;

  private _renderRetryMap = new Map<HTMLElement, number>();

  public setConfig(config: BackgroundGraphEntitiesConfig): void {
    if (!config || !config.entities || !Array.isArray(config.entities) || config.entities.length === 0) {
      throw new Error('You need to define at least one entity');
    }

    this._config = config;
    this._entities = config.entities.map((entityConf) =>
      typeof entityConf === 'string' ? { entity: entityConf } : entityConf,
    );

    // When config changes, we need to refetch history.
    this._historyFetched = false;
    this._history = new Map();
    this._setupUpdateInterval();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._setupUpdateInterval();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._timerId) {
      clearInterval(this._timerId);
      this._timerId = undefined;
    }
  }

  private _setupUpdateInterval(): void {
    if (this._timerId) clearInterval(this._timerId);
    const interval = this._config?.update_interval;
    if (interval) this._timerId = window.setInterval(() => this._fetchAndStoreAllHistory(), interval * 1000);
  }

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    // Ensure that the required Home Assistant components are loaded before creating the editor
    // by loading a core editor that uses them. This card requires Home Assistant 2023.4+
    // which provides `loadCardHelpers`.
    const loadHelpers = (window as CustomWindow).loadCardHelpers;
    if (!loadHelpers) {
      throw new Error('This card requires Home Assistant 2023.4+ and `loadCardHelpers` is not available.');
    }
    const helpers = await loadHelpers();
    // This is a trick to load the editor dependencies (e.g., ha-entity-picker)
    // by creating an instance of an entities card and triggering its editor to load.
    const entitiesCard = await helpers.createCardElement({ type: 'entities', entities: [] });
    await (entitiesCard.constructor as LovelaceCardConstructor).getConfigElement();

    await import('./editor.js');
    return document.createElement('background-graph-entities-editor') as LovelaceCardEditor;
  }

  public static getStubConfig(): Record<string, unknown> {
    return {
      entities: [{ entity: 'sun.sun' }],
      hours_to_show: 24,
    };
  }

  protected updated(changedProperties: Map<string | number | symbol, unknown>): void {
    if (this._config && this.hass && !this._historyFetched) {
      this._historyFetched = true; // Prevent re-fetching on every subsequent update
      this._fetchAndStoreAllHistory();
    }

    // Rerender graphs when history data or edit mode changes.
    if (changedProperties.has('_history') || changedProperties.has('editMode')) {
      // Defer rendering to the next frame to ensure the DOM is fully updated.
      requestAnimationFrame(() => this._renderAllGraphs());
    }
  }

  private _getCurveFactory() {
    const curveType = this._config?.curve || 'spline';
    switch (curveType) {
      case 'linear':
        return curveLinear;
      case 'step':
        return curveStep;
      case 'spline':
      default:
        return curveBasis;
    }
  }

  private _renderAllGraphs(): void {
    // If the component is no longer connected to the DOM, stop.
    if (!this.isConnected) return;

    const containers = this.renderRoot.querySelectorAll<HTMLElement>('.graph-container');
    if (!this._config?.entities) return;

    containers.forEach((container) => {
      const entityId = container.dataset.entityId;
      if (entityId) {
        const entityConfig = this._entities.find((e) => e.entity === entityId);
        const history = this._history.get(entityId);
        this._renderD3Graph(container, history, entityConfig);
      }
    });
  }

  private _createGradient(
    svg: Selection<SVGSVGElement, unknown, null, undefined>,
    yScale: ScaleLinear<number, number>,
    gradientId: string,
    thresholds: ColorThreshold[],
  ): string {
    const thresholdDomain = extent(thresholds, (t) => t.value) as [number, number];
    const gradient = svg
      .append('defs')
      .append('linearGradient')
      .attr('id', gradientId)
      .attr('gradientUnits', 'userSpaceOnUse')
      .attr('x1', 0)
      .attr('y1', yScale(thresholdDomain[0]))
      .attr('x2', 0)
      .attr('y2', yScale(thresholdDomain[1]));

    const sortedThresholds = [...thresholds].sort((a, b) => a.value - b.value);
    sortedThresholds.forEach((threshold) => {
      const range = thresholdDomain[1] - thresholdDomain[0];
      const offset = range > 0 ? (threshold.value - thresholdDomain[0]) / range : 0;
      gradient
        .append('stop')
        .attr('offset', `${Math.max(0, Math.min(1, offset)) * 100}%`)
        .attr('stop-color', threshold.color);
    });

    return `url(#${gradientId})`;
  }

  private _setupGradient(
    svg: Selection<SVGSVGElement, unknown, null, undefined>,
    yScale: ScaleLinear<number, number>,
    gradientId: string,
    entityConfig?: EntityConfig,
  ): string {
    const isDarkMode = this.hass.themes?.darkMode ?? false;
    const defaultColor = isDarkMode ? 'white' : 'black';

    // Check for entity-specific appearance override first
    if (entityConfig?.overwrite_graph_appearance) {
      const entityThresholds = entityConfig.color_thresholds;
      if (entityThresholds && entityThresholds.length > 0) {
        return this._createGradient(svg, yScale, gradientId, entityThresholds);
      }
      // If no entity thresholds, use entity line color, or fall back to global, then default.
      return entityConfig.line_color ?? this._config.line_color ?? defaultColor;
    }

    // If no entity override, use global settings
    const globalThresholds = this._config.color_thresholds;
    if (globalThresholds && globalThresholds.length > 0) {
      return this._createGradient(svg, yScale, gradientId, globalThresholds);
    }

    // Fallback to global line color, then default.
    return this._config.line_color ?? defaultColor;
  }

  private _getDotColor(value: number, entityConfig?: EntityConfig): string {
    const isDarkMode = this.hass.themes?.darkMode ?? false;
    const defaultColor = isDarkMode ? 'white' : 'black';

    let thresholds: ColorThreshold[] | undefined;
    let lineColor: string | undefined;

    if (entityConfig?.overwrite_graph_appearance) {
      thresholds = entityConfig.color_thresholds;
      lineColor = entityConfig.line_color;
    }

    // If no entity-specific override, use global settings
    if (thresholds === undefined) {
      thresholds = this._config.color_thresholds;
    }
    if (lineColor === undefined) {
      lineColor = this._config.line_color;
    }

    // Use thresholds if available
    if (thresholds && thresholds.length > 0) {
      const sortedThresholds = [...thresholds].sort((a, b) => a.value - b.value);
      // Find the last threshold that the value is greater than or equal to
      let color = sortedThresholds[0].color; // Default to the lowest threshold color
      for (const threshold of sortedThresholds) {
        if (value >= threshold.value) {
          color = threshold.color;
        } else {
          // Since thresholds are sorted, we can stop.
          break;
        }
      }
      return color;
    }

    // Fallback to line color, then default.
    return lineColor ?? defaultColor;
  }

  public getCardSize(): number {
    return this._config?.entities.length ? this._config.entities.length + 1 : 1;
  }

  private _openEntityPopup(entityId: string): void {
    const event = new CustomEvent('hass-more-info', {
      bubbles: true,
      cancelable: false,
      composed: true,
      detail: { entityId },
    });
    this.dispatchEvent(event);
  }

  private _renderEntityRow(entityConfig: EntityConfig): TemplateResult {
    const stateObj = this.hass.states[entityConfig.entity];
    if (!stateObj) return this._renderUnavailableEntityRow(entityConfig);
    const unit = stateObj.attributes.unit_of_measurement || '';
    let value = stateObj.state;
    const stateNum = parseFloat(stateObj.state);
    if (unit.toLowerCase() === 'min' && stateNum > 60) {
      const hours = Math.floor(stateNum / 60);
      const minutes = stateNum % 60;
      value = `${hours}h ${minutes}min`;
    } else {
      value = [stateObj.state, unit].filter(Boolean).join(' ');
    }

    return html`
      <div class="entity-row" @click=${() => this._openEntityPopup(entityConfig.entity)}>
        ${entityConfig.icon
          ? html`<ha-icon class="entity-icon" .icon=${entityConfig.icon}></ha-icon>`
          : html`<ha-state-icon class="entity-icon" .hass=${this.hass} .stateObj=${stateObj}></ha-state-icon>`}
        <div class="entity-name">${entityConfig.name || stateObj.attributes.friendly_name || entityConfig.entity}</div>
        <div class="graph-container" data-entity-id=${entityConfig.entity}></div>
        <div class="entity-value">${value}</div>
      </div>
    `;
  }

  private _renderUnavailableEntityRow(entityConfig: EntityConfig): TemplateResult {
    return html`
      <div class="entity-row unavailable" @click=${() => this._openEntityPopup(entityConfig.entity)}>
        <ha-icon class="entity-icon" icon="mdi:alert-circle-outline"></ha-icon>
        <div class="entity-name">${entityConfig.name || entityConfig.entity}</div>
        <div class="graph-container" data-entity-id=${entityConfig.entity}></div>
        <div class="entity-value">${this.hass.localize('state.default.unavailable') || 'Unavailable'}</div>
      </div>
    `;
  }

  private _renderD3Graph(
    container: HTMLElement,
    history: { timestamp: Date; value: number }[] | undefined,
    entityConfig?: EntityConfig,
  ): void {
    const MAX_RETRIES = 10;
    const retryCount = this._renderRetryMap.get(container) || 0;

    if (!container.isConnected || container.clientWidth === 0 || container.clientHeight === 0) {
      if (retryCount < MAX_RETRIES) {
        this._renderRetryMap.set(container, retryCount + 1);
        // If container is not ready, retry shortly.
        requestAnimationFrame(() => this._renderD3Graph(container, history, entityConfig));
      }
      return;
    }

    // Reset retry count on successful render
    this._renderRetryMap.delete(container);

    // Clear any previous graph
    select(container).html('');

    if (!history || history.length === 0) {
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    const hoursToShow = this._config?.hours_to_show || 24;
    const end = new Date();
    const start = new Date();
    start.setHours(end.getHours() - hoursToShow);

    const xDomain: [Date, Date] = [start, end];

    // Clone history to avoid mutating the state, and add a point at the end
    // to extend the graph to the current time.
    const processedHistory = [...history];
    const lastHistory = processedHistory[processedHistory.length - 1];
    if (lastHistory) {
      processedHistory.push({
        timestamp: end,
        value: lastHistory.value,
      });
    }

    if (processedHistory.length < 2) {
      return; // Not enough points to draw a line
    }

    const yDomain = extent(processedHistory, (d) => d.value) as [number, number];

    if (yDomain[0] === yDomain[1]) {
      yDomain[0] -= 1;
      yDomain[1] += 1;
    }

    const yPadding = (yDomain[1] - yDomain[0]) * 0.1;
    yDomain[0] -= yPadding;
    yDomain[1] += yPadding;

    const xScale = scaleTime().domain(xDomain).range([0, width]);
    const yScale = scaleLinear().domain(yDomain).range([height, 0]);

    const svg = select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'none');

    const glowId = `bge-glow-${container.dataset.entityId}`;
    if (this._config.line_glow) {
      const defs = svg.append('defs');
      const filter = defs
        .append('filter')
        .attr('id', glowId)
        .attr('x', '-50%')
        .attr('y', '-50%')
        .attr('width', '200%')
        .attr('height', '200%');

      filter.append('feGaussianBlur').attr('stdDeviation', 2.5).attr('result', 'coloredBlur');

      const merge = filter.append('feMerge');
      merge.append('feMergeNode').attr('in', 'coloredBlur');
      merge.append('feMergeNode').attr('in', 'SourceGraphic');
    }

    const gradientId = `bge-gradient-${container.dataset.entityId}`;
    const strokeColor = this._setupGradient(svg, yScale, gradientId, entityConfig);

    const lineGenerator = d3Line<{ timestamp: Date; value: number }>()
      .x((d) => xScale(d.timestamp))
      .y((d) => yScale(d.value))
      .curve(this._getCurveFactory());

    svg
      .append('path')
      .datum(processedHistory)
      .attr('class', 'graph-path')
      .attr('d', lineGenerator)
      .attr('stroke', strokeColor)
      .attr(
        'stroke-opacity',
        entityConfig?.overwrite_graph_appearance && entityConfig.line_opacity !== undefined
          ? entityConfig.line_opacity
          : (this._config?.line_opacity ?? 0.2),
      )
      .attr('stroke-width', this._config?.line_width || 3)
      .attr('filter', this._config.line_glow ? `url(#${glowId})` : null);

    // The first point in history is an anchor at the start time, not a bucket.
    // We only want to show dots for the actual data buckets.
    const dotData = history.slice(1);
    if (this.editMode) {
      svg
        .selectAll('.graph-dot')
        .data(dotData)
        .enter()
        .append('circle')
        .attr('class', 'graph-dot')
        .attr('cx', (d) => xScale(d.timestamp))
        .attr('cy', (d) => yScale(d.value))
        .attr('r', 2)
        .attr('fill', (d) => this._getDotColor(d.value, entityConfig));
    }
  }

  private async _fetchAndStoreAllHistory(): Promise<void> {
    if (this._entities.length === 0) {
      if (this._history.size > 0) this._history = new Map();
      return;
    }
    const newHistory = new Map<string, { timestamp: Date; value: number }[]>();
    const historyPromises = this._entities
      .filter((entityConf) => entityConf.entity)
      .map(async (entityConf) => {
        const entityId = entityConf.entity;
        const history = await this._fetchHistory(entityId);
        if (history) {
          newHistory.set(entityId, history);
        }
      });
    await Promise.all(historyPromises);
    this._history = newHistory;
  }

  private _downsampleHistory(
    states: { timestamp: Date; value: number }[],
    hours: number,
    pointsPerHour: number,
  ): { timestamp: Date; value: number }[] {
    if (pointsPerHour <= 0 || states.length === 0) {
      return states; // Return raw states if downsampling is disabled or no data
    }

    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 3600 * 1000);
    const interval = (3600 * 1000) / pointsPerHour;
    const numBuckets = Math.ceil((now.getTime() - startTime.getTime()) / interval);

    const buckets: { values: number[] }[] = Array.from({ length: numBuckets }, () => ({
      values: [],
    }));

    for (const state of states) {
      const stateTime = state.timestamp.getTime();
      if (stateTime < startTime.getTime()) continue;

      const bucketIndex = Math.floor((stateTime - startTime.getTime()) / interval);
      if (bucketIndex >= 0 && bucketIndex < numBuckets) {
        buckets[bucketIndex].values.push(state.value);
      }
    }

    const downsampled: { timestamp: Date; value: number }[] = [];
    // The first state is guaranteed by `include_start_time_state: true` to be the value at the start of the window.
    let lastValue = states[0].value;

    for (let i = 0; i < numBuckets; i++) {
      const bucket = buckets[i];
      let median: number;

      if (bucket.values.length > 0) {
        const sortedValues = bucket.values.sort((a, b) => a - b);
        const mid = Math.floor(sortedValues.length / 2);
        median = sortedValues.length % 2 !== 0 ? sortedValues[mid] : (sortedValues[mid - 1] + sortedValues[mid]) / 2;
        lastValue = median; // Update last known value
      } else {
        // Empty bucket, carry forward the last known value
        median = lastValue;
      }

      downsampled.push({
        // Use the end of the bucket interval as the timestamp
        timestamp: new Date(startTime.getTime() + (i + 1) * interval),
        value: median,
      });
    }

    // Add a point at the very beginning to anchor the graph.
    if (downsampled.length > 0) {
      downsampled.unshift({ timestamp: startTime, value: states[0].value });
    }

    return downsampled;
  }

  private async _fetchHistory(entityId: string): Promise<{ timestamp: Date; value: number }[] | null> {
    if (!this.hass?.callWS) return null;

    const hoursToShow = this._config?.hours_to_show || 24;
    const pointsPerHour = this._config?.points_per_hour || 1;

    const start = new Date();
    start.setHours(start.getHours() - hoursToShow);

    try {
      const history = await this.hass.callWS<{
        [key: string]: { s: string; lu: number }[];
      }>({
        type: 'history/history_during_period',
        start_time: start.toISOString(),
        end_time: new Date().toISOString(),
        entity_ids: [entityId],
        minimal_response: true,
        no_attributes: true,
        include_start_time_state: true,
      });

      const states = history[entityId];
      if (!states) {
        return [];
      }

      const finalStates = states
        .map((s) => {
          let value: number;
          if (s.s === 'on') value = 1;
          else if (s.s === 'off') value = 0;
          else value = Number(s.s);
          return { timestamp: new Date(s.lu * 1000), value };
        })
        .filter((s) => !isNaN(s.value));
      return this._downsampleHistory(finalStates, hoursToShow, pointsPerHour);
    } catch (err) {
      console.error(`Error fetching history for ${entityId}:`, err);
      return null;
    }
  }

  protected render(): TemplateResult {
    if (!this._config || !this.hass) {
      return html``;
    }

    return html`
      <ha-card .header=${this._config.title}>
        <div class="card-content ${this._config.line_length === 'short' ? 'short' : ''}">
          ${this._entities.map((entity) => this._renderEntityRow(entity))}
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    ${unsafeCSS(styles)}
  `;
}

if (typeof window !== 'undefined') {
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: ELEMENT_NAME,
    name: 'Background Graph Entities',
    description: 'A card to display entities with a background graph.',
  });
}
