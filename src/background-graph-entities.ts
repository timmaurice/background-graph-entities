import { LitElement, TemplateResult, html, css, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceCardConfig,
  BackgroundGraphEntitiesConfig,
  EntityConfig,
} from './types.js';
import { extent } from 'd3-array';
import { scaleLinear, scaleTime, ScaleLinear } from 'd3-scale';
import { select, Selection } from 'd3-selection';
import { line as d3Line, curveBasis } from 'd3-shape';
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
  @state() private _config!: BackgroundGraphEntitiesConfig;
  @state() private _entities: EntityConfig[] = [];
  @state() private _history: Map<string, { timestamp: Date; value: number }[]> = new Map();
  @state() private _historyFetched = false;
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
    console.log('[BGE] getConfigElement called, creating editor element.');
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

    // The D3 rendering should happen after an update when history is available.
    if (changedProperties.has('_history')) {
      // Defer rendering to the next frame to ensure the DOM is fully updated and
      // the containers are available to be queried.
      requestAnimationFrame(() => this._renderAllGraphs());
    }
  }

  private _renderAllGraphs(retryCount = 0): void {
    // If the component is no longer connected to the DOM, stop.
    if (!this.isConnected) return;

    const MAX_RETRIES = 10;
    const containers = this.renderRoot.querySelectorAll<HTMLElement>('.graph-container');

    if (containers.length === 0) {
      if (retryCount < MAX_RETRIES) {
        requestAnimationFrame(() => this._renderAllGraphs(retryCount + 1));
      } else {
        console.warn(`[BGE] _renderAllGraphs: Could not find graph containers after ${MAX_RETRIES} retries.`);
      }
      return;
    }

    if (!this._config?.entities) return;

    containers.forEach((container) => {
      const entityId = container.dataset.entityId;
      if (entityId) {
        const history = this._history.get(entityId);
        this._renderD3Graph(container, history);
      }
    });
  }

  private _setupGradient(
    svg: Selection<SVGSVGElement, unknown, null, undefined>,
    yScale: ScaleLinear<number, number>,
    gradientId: string,
  ): string {
    const thresholds = this._config.color_thresholds;
    if (!thresholds || thresholds.length === 0) {
      return this._config?.line_color || 'rgba(255, 255, 255, 0.2)';
    }

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

  private _renderD3Graph(container: HTMLElement, history: { timestamp: Date; value: number }[] | undefined): void {
    const MAX_RETRIES = 10;
    const retryCount = this._renderRetryMap.get(container) || 0;

    if (!container.isConnected || container.clientWidth === 0 || container.clientHeight === 0) {
      if (retryCount < MAX_RETRIES) {
        this._renderRetryMap.set(container, retryCount + 1);
        // If container is not ready, retry shortly.
        requestAnimationFrame(() => this._renderD3Graph(container, history));
      } else {
        console.warn(
          `[BGE] _renderD3Graph: Could not render graph for ${container.dataset.entityId} after ${MAX_RETRIES} retries. The container might not be visible.`,
        );
        this._renderRetryMap.delete(container); // Reset for next time
      }
      return;
    }

    // Reset retry count on successful render
    this._renderRetryMap.delete(container);

    // Clear any previous graph
    select(container).html('');

    if (!history || history.length < 2) {
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    const xDomain = extent(history, (d) => d.timestamp) as [Date, Date];
    const yDomain = extent(history, (d) => d.value) as [number, number];

    const yPadding = (yDomain[1] - yDomain[0]) * 0.1;
    yDomain[0] -= yPadding;
    yDomain[1] += yPadding;

    const xScale = scaleTime().domain(xDomain).range([0, width]);
    const yScale = scaleLinear().domain(yDomain).range([height, 0]);

    const svg = select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'none');

    if (yDomain[0] === yDomain[1]) {
      yDomain[0] -= 1;
      yDomain[1] += 1;
    }

    const gradientId = `bge-gradient-${container.dataset.entityId}`;
    const strokeColor = this._setupGradient(svg, yScale, gradientId);

    const lineGenerator = d3Line<{ timestamp: Date; value: number }>()
      .x((d) => xScale(d.timestamp))
      .y((d) => yScale(d.value))
      .curve(curveBasis);

    svg
      .append('path')
      .datum(history)
      .attr('class', 'graph-path')
      .attr('d', lineGenerator)
      .attr('stroke', strokeColor)
      .attr('stroke-opacity', this._config?.line_opacity ?? 0.2)
      .attr('stroke-width', this._config?.line_width || 3);
  }

  private async _fetchAndStoreAllHistory(): Promise<void> {
    if (this._entities.length === 0) {
      if (this._history.size > 0) this._history = new Map();
      return;
    }
    const newHistory = new Map<string, { timestamp: Date; value: number }[]>();
    const historyPromises = this._entities.map(async (entityConf) => {
      const entityId = entityConf.entity;
      const history = await this._fetchHistory(entityId);
      if (history) {
        newHistory.set(entityId, history);
      }
    });
    const oldHistory = this._history;
    await Promise.all(historyPromises);
    this._history = newHistory;
    this.requestUpdate('_history', oldHistory);
  }

  private _downsampleHistory(
    states: { timestamp: Date; value: number }[],
    hours: number,
    pointsPerHour: number,
  ): { timestamp: Date; value: number }[] {
    if (pointsPerHour <= 0 || states.length <= hours * pointsPerHour) {
      return states;
    }

    const interval = (3600 * 1000) / pointsPerHour;
    const grouped = new Map<number, { sum: number; count: number; lastTs: Date }>();

    for (const state of states) {
      const key = Math.floor(state.timestamp.getTime() / interval);
      if (!grouped.has(key)) grouped.set(key, { sum: 0, count: 0, lastTs: state.timestamp });
      const group = grouped.get(key)!;
      group.sum += state.value;
      group.count++;
      group.lastTs = state.timestamp;
    }

    return Array.from(grouped.values()).map((group) => ({
      timestamp: group.lastTs,
      value: group.sum / group.count,
    }));
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
      });

      const states = history[entityId];
      if (!states) {
        return [];
      }

      const processedStates = states.map((s) => {
        // Keep original state `s.s` for logging, but calculate numeric value
        let value: number;
        // Handle binary sensor states
        if (s.s === 'on') {
          value = 1;
        } else if (s.s === 'off') {
          value = 0;
        } else {
          value = Number(s.s);
        }
        return { timestamp: new Date(s.lu * 1000), value, originalState: s.s };
      });

      const filteredStates = processedStates.filter((s) => !isNaN(s.value));

      const finalStates = filteredStates.map(({ timestamp, value }) => ({ timestamp, value }));

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
    .graph-path {
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `;
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: ELEMENT_NAME,
  name: 'Background Graph Entities',
  description: 'A card to display entities with a background graph.',
});
