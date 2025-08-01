import { LitElement, TemplateResult, html, css, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardEditor,
  BackgroundGraphEntitiesConfig,
  EntityConfig,
} from './types.js';
import { extent } from 'd3-array';
import { scaleLinear, scaleTime } from 'd3-scale';
import { select } from 'd3-selection';
import { line as d3Line, curveBasis } from 'd3-shape';
import styleString from './styles.scss';
import './editor';

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

@customElement(ELEMENT_NAME)
export class BackgroundGraphEntities extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: BackgroundGraphEntitiesConfig;
  @state() private _history: Map<string, { timestamp: Date; value: number }[]> = new Map();
  @state() private _historyFetched = false;

  private _renderRetryMap = new Map<HTMLElement, number>();

  public setConfig(config: BackgroundGraphEntitiesConfig): void {
    if (!config.entities || !Array.isArray(config.entities) || config.entities.length === 0) {
      throw new Error('You need to define at least one entity');
    }

    this._config = {
      ...config,
      entities: config.entities.map((entityConf) =>
        typeof entityConf === 'string' ? { entity: entityConf } : entityConf,
      ),
    };
    // When config changes, we need to refetch history.
    this._historyFetched = false;
    this._history = new Map();
  }

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
        return document.createElement('background-graph-entities-editor') as LovelaceCardEditor;

  }

  public static getStubConfig(): Record<string, unknown> {
    return {
      entities: [{ entity: 'sun.sun' }],
      hours_to_show: 24,
    };
  }

  protected updated(changedProperties: Map<string | number | symbol, unknown>): void {
    console.debug('[BGE] updated called with changedProperties:', changedProperties);
    if (this._config && this.hass && !this._historyFetched) {
      this._historyFetched = true; // Prevent re-fetching on every subsequent update
      console.debug('[BGE] Config and HASS are available, fetching history.');
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

    console.debug(`[BGE] _renderAllGraphs called (attempt ${retryCount + 1}). Found ${containers.length} containers.`);

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
        console.debug(`[BGE] Rendering graph for ${entityId} with history:`, history);
        this._renderD3Graph(container, history);
      }
    });
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

    const lineOpacity = entityConfig.line_opacity ? `opacity: ${entityConfig.line_opacity};` : '';

    return html`
      <div class="entity-row" @click=${() => this._openEntityPopup(entityConfig.entity)}>
        ${entityConfig.icon
          ? html`<ha-icon class="entity-icon" .icon=${entityConfig.icon}></ha-icon>`
          : html`<ha-state-icon class="entity-icon" .hass=${this.hass} .stateObj=${stateObj}></ha-state-icon>`}
        <div class="entity-name">${entityConfig.name || stateObj.attributes.friendly_name || entityConfig.entity}</div>
        <div class="graph-container" data-entity-id=${entityConfig.entity} style=${lineOpacity}></div>
        <div class="entity-value">${value}</div>
      </div>
    `;
  }

  private _renderUnavailableEntityRow(entityConfig: EntityConfig): TemplateResult {
    console.debug(`[BGE] Rendering unavailable row for ${entityConfig.entity}`);
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
        console.debug(
          `[BGE] _renderD3Graph: Container for ${
            container.dataset.entityId
          } not ready. Retrying (attempt ${retryCount + 1}/${MAX_RETRIES}).`,
          {
            isConnected: container.isConnected,
            clientWidth: container.clientWidth,
            clientHeight: container.clientHeight,
          },
        );
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
      console.debug(
        `[BGE] _renderD3Graph: Not enough history data for ${container.dataset.entityId}. Found ${
          history?.length ?? 0
        } points. No graph will be rendered.`,
      );
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    console.debug(
      `[BGE] _renderD3Graph: Drawing graph for ${container.dataset.entityId} in a ${width}x${height} container.`,
    );

    const xDomain = extent(history, (d) => d.timestamp) as [Date, Date];
    const yDomain = extent(history, (d) => d.value) as [number, number];

    const yPadding = (yDomain[1] - yDomain[0]) * 0.1;
    yDomain[0] -= yPadding;
    yDomain[1] += yPadding;
    if (yDomain[0] === yDomain[1]) {
      yDomain[0] -= 1;
      yDomain[1] += 1;
    }

    const xScale = scaleTime().domain(xDomain).range([0, width]);
    const yScale = scaleLinear().domain(yDomain).range([height, 0]);

    const svg = select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'none');

    const lineGenerator = d3Line<{ timestamp: Date; value: number }>()
      .x((d) => xScale(d.timestamp))
      .y((d) => yScale(d.value))
      .curve(curveBasis);

    svg
      .append('path')
      .datum(history)
      .attr('class', 'graph-path')
      .attr('d', lineGenerator)
      .attr('stroke', this._config?.line_color || 'var(--primary-text-color)')
      .attr('stroke-width', this._config?.line_width || 2);
  }

  private async _fetchAndStoreAllHistory(): Promise<void> {
    if (!this._config?.entities) {
      if (this._history.size > 0) {
        this._history = new Map();
      }
      return;
    }
    console.debug('[BGE] _fetchAndStoreAllHistory: Starting fetch for all entities.');

    const newHistory = new Map<string, { timestamp: Date; value: number }[]>();
    const historyPromises = (this._config.entities as EntityConfig[]).map(async (entityConf) => {
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
    console.debug('[BGE] _fetchAndStoreAllHistory: Finished. History map:', this._history);
  }
  private async _fetchHistory(entityId: string): Promise<{ timestamp: Date; value: number }[] | null> {
    if (!this.hass?.callWS) return null;

    const hoursToShow = this._config?.hours_to_show || 24;

    const start = new Date();
    console.debug(`[BGE] _fetchHistory: Fetching history for ${entityId} for the last ${hoursToShow} hours.`);
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

      console.debug(`[BGE] _fetchHistory: Raw response for ${entityId}:`, history);

      const states = history[entityId];
      if (!states) {
        console.debug(`[BGE] _fetchHistory: No states returned for ${entityId}.`);
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

      console.debug(`[BGE] _fetchHistory: Processed states for ${entityId} (before filtering NaN):`, processedStates);

      const filteredStates = processedStates.filter((s) => !isNaN(s.value));

      console.debug(`[BGE] _fetchHistory: Final filtered states for ${entityId}:`, filteredStates);

      // Return only the properties needed for the graph
      return filteredStates.map(({ timestamp, value }) => ({ timestamp, value }));
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
          ${(this._config.entities as EntityConfig[]).map((entity) => this._renderEntityRow(entity))}
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    ${unsafeCSS(styleString)}
  `;
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: ELEMENT_NAME,
  name: 'Background Graph Entities',
  description: 'A card to display entities with a background graph.',
});
