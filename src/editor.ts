import { LitElement, html, css, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  HomeAssistant,
  LovelaceCardEditor,
  BackgroundGraphEntitiesConfig,
  EntityConfig,
  ColorThreshold,
} from './types';
import { localize } from './localize';
import { fireEvent } from './utils';
import editorStyles from './styles/editor.styles.scss';
import 'vanilla-colorful/rgb-string-color-picker.js';

type EditorInternalConfig = Omit<BackgroundGraphEntitiesConfig, 'entities' | 'color_thresholds'> & {
  entities: EntityConfig[];
  color_thresholds: ColorThreshold[];
};

interface ValueChangedEventTarget extends EventTarget {
  configValue?: keyof EditorInternalConfig;
  value: string;
  type?: string;
}

interface ColorPicker extends HTMLElement {
  configValue?: keyof EditorInternalConfig;
}

type ThresholdEventTarget = HTMLElement & { value?: string };

@customElement('background-graph-entities-editor')
export class BackgroundGraphEntitiesEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config: EditorInternalConfig = {
    type: 'custom:background-graph-entities',
    entities: [],
    color_thresholds: [],
  };
  @state() private _draggedIndex: number | null = null;
  @state() private _dropIndex: number | null = null;
  @state() private _draggedThresholdIndex: number | null = null;
  @state() private _dropThresholdIndex: number | null = null;
  @state() private _activeColorPicker: string | null = null;

  public setConfig(config: BackgroundGraphEntitiesConfig): void {
    try {
      console.log('[BGE Editor] setConfig received:', JSON.parse(JSON.stringify(config)));

      const entities = (config.entities || []).filter(Boolean).map((e) => (typeof e === 'string' ? { entity: e } : e));

      this._config = {
        ...config,
        entities,
        color_thresholds: config.color_thresholds || [],
      };

      this.requestUpdate();
      console.log('[BGE Editor] Parsed config:', this._config);
    } catch (e) {
      console.error('[BGE Editor] setConfig error:', e);
      this._config = { type: 'custom:background-graph-entities', entities: [], color_thresholds: [] };
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('click', this._handleOutsideClick);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('click', this._handleOutsideClick);
  }

  private _handleOutsideClick = (ev: MouseEvent): void => {
    if (!this._activeColorPicker) {
      return;
    }
    const path = ev.composedPath();
    if (path.some((el) => el instanceof HTMLElement && el.dataset.pickerId === this._activeColorPicker)) {
      // Click was inside the currently open picker's wrapper, so do nothing.
      // The toggle handler will manage closing it if the trigger is clicked again.
      return;
    }
    // Click was outside, close the picker.
    this._activeColorPicker = null;
  };

  private _toggleColorPicker(ev: MouseEvent, pickerId: string): void {
    this._activeColorPicker = this._activeColorPicker === pickerId ? null : pickerId;
  }

  private _valueChanged(ev: Event): void {
    const target = ev.target as ValueChangedEventTarget;
    const configValue = target.configValue;
    if (!configValue || !this._config) return;

    const newConfig = { ...this._config };
    let value: string | number | undefined = target.value;

    if (target.type === 'number') {
      value = target.value === '' ? undefined : Number(target.value);
    }

    if (value === undefined || (typeof value === 'number' && isNaN(value))) {
      delete newConfig[configValue];
    } else {
      newConfig[configValue] = value;
    }

    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _entityAttributeChanged(ev: Event): void {
    const target = ev.target as HTMLElement & { value?: string };
    const index = Number(target.dataset.index);
    const field = target.dataset.field as keyof EntityConfig;

    if (!this._config || isNaN(index) || !field) return;

    const value = (ev as CustomEvent).detail?.value ?? target.value;

    const newEntities = [...this._config.entities];
    newEntities[index] = {
      ...newEntities[index],
      [field]: value,
    };

    const newConfig = { ...this._config, entities: newEntities };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _colorPicked(ev: CustomEvent): void {
    const target = ev.target as ColorPicker;
    const configValue = target.configValue;
    if (!configValue || !this._config) return;

    const newValue = ev.detail.value;
    if (this._config[configValue] === newValue) return;

    const newConfig: EditorInternalConfig = {
      ...this._config,
      [configValue]: newValue || undefined,
    };

    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig });
    this._activeColorPicker = null;
  }

  private _thresholdChanged(ev: Event, index: number): void {
    if (!this._config) return;

    const target = ev.target as ThresholdEventTarget;
    const field = target.dataset.field as keyof ColorThreshold;
    const isColorPicker = target.tagName.toLowerCase().includes('color-picker');
    const value = isColorPicker ? (ev as CustomEvent).detail.value : target.value;

    const newThresholds = [...this._config.color_thresholds];
    newThresholds[index] = {
      ...newThresholds[index],
      [field]: field === 'value' ? Number(value) : value,
    };

    const newConfig = { ...this._config, color_thresholds: newThresholds };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig });
    if (isColorPicker) {
      this._activeColorPicker = null;
    }
  }

  private _addThreshold(): void {
    if (!this._config) return;
    const newThresholds = [...this._config.color_thresholds, { value: 0, color: '#000000' }];
    const newConfig = { ...this._config, color_thresholds: newThresholds };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _removeThreshold(index: number): void {
    if (!this._config) return;
    const newThresholds = [...this._config.color_thresholds];
    newThresholds.splice(index, 1);
    const newConfig = { ...this._config, color_thresholds: newThresholds };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _handleThresholdDragStart(ev: DragEvent, index: number): void {
    this._draggedThresholdIndex = index;
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
  }

  private _handleThresholdDragOver(ev: DragEvent, index: number): void {
    ev.preventDefault();
    if (index !== this._draggedThresholdIndex) this._dropThresholdIndex = index;
  }

  private _handleThresholdDrop(ev: DragEvent): void {
    ev.preventDefault();
    if (this._draggedThresholdIndex === null || this._dropThresholdIndex === null) return;

    const newThresholds = [...this._config.color_thresholds];
    const [draggedItem] = newThresholds.splice(this._draggedThresholdIndex, 1);
    newThresholds.splice(this._dropThresholdIndex, 0, draggedItem);

    const newConfig = { ...this._config, color_thresholds: newThresholds };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig });

    this._draggedThresholdIndex = null;
    this._dropThresholdIndex = null;
  }

  private _handleDragStart(ev: DragEvent, index: number): void {
    this._draggedIndex = index;
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
    }
  }

  private _handleDragOver(ev: DragEvent, index: number): void {
    ev.preventDefault();
    if (index !== this._draggedIndex) {
      this._dropIndex = index;
    }
  }

  private _handleDragLeave(): void {
    this._dropIndex = null;
  }

  private _handleDrop(ev: DragEvent): void {
    ev.preventDefault();
    if (this._draggedIndex === null || this._dropIndex === null || this._draggedIndex === this._dropIndex) {
      this._handleDragEnd();
      return;
    }

    const newEntities = [...this._config.entities];
    const [draggedItem] = newEntities.splice(this._draggedIndex, 1);
    newEntities.splice(this._dropIndex, 0, draggedItem);

    const newConfig = { ...this._config, entities: newEntities };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig });

    this._handleDragEnd();
  }

  private _handleDragEnd(): void {
    this._draggedIndex = null;
    this._dropIndex = null;
  }

  private _addEntity(): void {
    const newEntities = [...this._config.entities, { entity: '' }];
    const newConfig = { ...this._config, entities: newEntities };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _removeEntity(index: number): void {
    const newEntities = [...this._config.entities];
    newEntities.splice(index, 1);
    const newConfig = { ...this._config, entities: newEntities };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  protected render(): TemplateResult {
    console.log('[BGE Editor] Rendering with config:', this._config);

    if (!this.hass || !this._config) {
      return html`<div>Waiting for config…</div>`;
    }

    return html`
      <div class="card-config">
        <h3>${localize(this.hass, 'component.bge.editor.general')}</h3>
        <div class="side-by-side">
          <ha-textfield
            .label=${localize(this.hass, 'component.bge.editor.title')}
            .value=${this._config.title || ''}
            .configValue=${'title'}
            @change=${this._valueChanged}
          ></ha-textfield>
        </div>

        <h3>${localize(this.hass, 'component.bge.editor.graph_appearance')}</h3>
        <div class="side-by-side">
          <ha-textfield
            .label=${localize(this.hass, 'component.bge.editor.hours_to_show')}
            type="number"
            .value=${String(this._config.hours_to_show ?? 24)}
            .configValue=${'hours_to_show'}
            @change=${this._valueChanged}
          ></ha-textfield>

          <ha-textfield
            .label=${localize(this.hass, 'component.bge.editor.line_width')}
            type="number"
            .value=${String(this._config.line_width ?? 5)}
            .configValue=${'line_width'}
            @change=${this._valueChanged}
          ></ha-textfield>
        </div>

        <div class="side-by-side">
          <ha-select
            .label=${localize(this.hass, 'component.bge.editor.line_length')}
            .value=${this._config.line_length || 'long'}
            .configValue=${'line_length'}
            @selected=${this._valueChanged}
            @closed=${(ev: Event) => ev.stopPropagation()}
          >
            <mwc-list-item value="long">${localize(this.hass, 'component.bge.editor.line_length_long')}</mwc-list-item>
            <mwc-list-item value="short"
              >${localize(this.hass, 'component.bge.editor.line_length_short')}</mwc-list-item
            >
          </ha-select>
        </div>

        <div class="side-by-side">
          <div class="color-input-wrapper" data-picker-id="line_color">
            <ha-textfield
              .label=${localize(this.hass, 'component.bge.editor.line_color')}
              .value=${this._config.line_color || 'rgba(255, 255, 255, 0.2)'}
              .configValue=${'line_color'}
              @change=${this._valueChanged}
            >
              <div
                slot="trailingIcon"
                class="color-preview"
                style="background-color: ${this._config.line_color || 'transparent'}"
                @click=${(e: MouseEvent) => this._toggleColorPicker(e, 'line_color')}
              ></div>
            </ha-textfield>
            ${this._activeColorPicker === 'line_color'
              ? html`
                  <div class="color-picker-popup">
                    <rgb-string-color-picker
                      .color=${this._config.line_color || 'rgba(255, 255, 255, 0.2)'}
                      .configValue=${'line_color'}
                      @color-changed=${this._colorPicked}
                      alpha
                    ></rgb-string-color-picker>
                  </div>
                `
              : ''}
          </div>
          <ha-textfield
            .label=${localize(this.hass, 'component.bge.editor.line_opacity')}
            type="number"
            .value=${String(this._config.line_opacity ?? 1)}
            .configValue=${'line_opacity'}
            @change=${this._valueChanged}
            .step=${0.1}
            .min=${0}
            .max=${1}
          ></ha-textfield>
        </div>

        <h3>${localize(this.hass, 'component.bge.editor.color_thresholds')}</h3>
        <div class="entities-container">
          ${this._config.color_thresholds.map(
            (threshold, index) => html`
              <div
                class="entity-container threshold-container ${this._dropThresholdIndex === index
                  ? 'drag-over'
                  : ''} ${this._draggedThresholdIndex === index ? 'dragging' : ''}"
                draggable="true"
                @dragstart=${(e: DragEvent) => this._handleThresholdDragStart(e, index)}
                @dragover=${(e: DragEvent) => this._handleThresholdDragOver(e, index)}
                @dragleave=${() => (this._dropThresholdIndex = null)}
                @drop=${this._handleThresholdDrop}
                @dragend=${() => {
                  this._draggedThresholdIndex = null;
                  this._dropThresholdIndex = null;
                }}
              >
                <div class="drag-handle">
                  <ha-icon .icon=${'mdi:drag-vertical'}></ha-icon>
                </div>
                <div class="threshold-inputs">
                  <ha-textfield
                    .label=${localize(this.hass, 'component.bge.editor.value')}
                    type="number"
                    .value=${String(threshold.value)}
                    data-field="value"
                    @change=${(e: Event) => this._thresholdChanged(e, index)}
                  ></ha-textfield>
                  <div class="color-input-wrapper" data-picker-id=${`threshold_${index}`}>
                    <ha-textfield
                      .label=${localize(this.hass, 'component.bge.editor.color')}
                      .value=${threshold.color}
                      data-field="color"
                      data-index=${String(index)}
                      @change=${(e: Event) => this._thresholdChanged(e, index)}
                    >
                      <div
                        slot="trailingIcon"
                        class="color-preview"
                        style="background-color: ${threshold.color}"
                        @click=${(e: MouseEvent) => this._toggleColorPicker(e, `threshold_${index}`)}
                      ></div>
                    </ha-textfield>
                    ${this._activeColorPicker === `threshold_${index}`
                      ? html` <div class="color-picker-popup">
                          <rgb-string-color-picker
                            .color=${threshold.color}
                            data-field="color"
                            @color-changed=${(e: CustomEvent) => this._thresholdChanged(e, index)}
                            alpha
                          ></rgb-string-color-picker>
                        </div>`
                      : ''}
                  </div>
                </div>
                <ha-icon-button
                  class="remove-icon"
                  .path=${'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z'}
                  @click=${() => this._removeThreshold(index)}
                ></ha-icon-button>
              </div>
            `,
          )}
        </div>
        <ha-button @click=${this._addThreshold}>
          ${localize(this.hass, 'component.bge.editor.add_threshold')}
        </ha-button>

        <h3>${localize(this.hass, 'component.bge.editor.data_settings')}</h3>
        <div class="side-by-side">
          <ha-textfield
            .label=${localize(this.hass, 'component.bge.editor.points_per_hour')}
            type="number"
            .value=${String(this._config.points_per_hour ?? 1)}
            .configValue=${'points_per_hour'}
            @change=${this._valueChanged}
          ></ha-textfield>
          <ha-textfield
            .label=${localize(this.hass, 'component.bge.editor.update_interval')}
            type="number"
            .value=${String(this._config.update_interval ?? 600)}
            .configValue=${'update_interval'}
            @change=${this._valueChanged}
          ></ha-textfield>
        </div>

        <h3>${localize(this.hass, 'component.bge.editor.entities')}</h3>

        <div class="entities-container">
          ${this._config.entities.map(
            (entity, index) => html`
              <div
                class="entity-container ${this._dropIndex === index ? 'drag-over' : ''} ${this._draggedIndex === index
                  ? 'dragging'
                  : ''}"
                draggable="true"
                @dragstart=${(e: DragEvent) => this._handleDragStart(e, index)}
                @dragover=${(e: DragEvent) => this._handleDragOver(e, index)}
                @dragleave=${this._handleDragLeave}
                @drop=${this._handleDrop}
                @dragend=${this._handleDragEnd}
              >
                <div class="drag-handle">
                  <ha-icon .icon=${'mdi:drag-vertical'}></ha-icon>
                </div>
                <div class="entity-content">
                  <div class="entity-main">
                    <ha-entity-picker
                      .hass=${this.hass}
                      .label=${localize(this.hass, 'component.bge.editor.entity')}
                      .value=${entity.entity || ''}
                      data-index=${index}
                      data-field="entity"
                      @value-changed=${this._entityAttributeChanged}
                      allow-custom-entity
                    ></ha-entity-picker>
                    <ha-icon-button
                      class="remove-icon"
                      .path=${'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z'}
                      @click=${() => this._removeEntity(index)}
                    ></ha-icon-button>
                  </div>
                  <ha-expansion-panel .header=${localize(this.hass, 'component.bge.editor.optional_overrides')}>
                    <div class="overrides">
                      <ha-textfield
                        .label=${localize(this.hass, 'component.bge.editor.name')}
                        .value=${entity.name || ''}
                        data-index=${index}
                        data-field="name"
                        @change=${this._entityAttributeChanged}
                      ></ha-textfield>
                      <ha-icon-picker
                        .hass=${this.hass}
                        .label=${localize(this.hass, 'component.bge.editor.icon')}
                        .value=${entity.icon || ''}
                        data-index=${index}
                        data-field="icon"
                        @value-changed=${this._entityAttributeChanged}
                      ></ha-icon-picker>
                    </div>
                  </ha-expansion-panel>
                </div>
              </div>
            `,
          )}
        </div>
        <ha-button @click=${this._addEntity}> ${localize(this.hass, 'component.bge.editor.add_entity')} </ha-button>

        <hr />
        <pre><code>Debug:
${JSON.stringify(this._config.entities, null, 2)}</code></pre>
      </div>
    `;
  }

  static styles = css`
    ${unsafeCSS(editorStyles)}
  `;
}
