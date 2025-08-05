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
  value: string | number;
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
  @state() private _editingIndex: number | null = null;

  public setConfig(config: BackgroundGraphEntitiesConfig): void {
    const entities = (config.entities || []).filter(Boolean).map((e) => (typeof e === 'string' ? { entity: e } : e));

    this._config = {
      ...config,
      entities,
      color_thresholds: config.color_thresholds || [],
    };

    this.requestUpdate();
  }

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('mousedown', this._handleOutsideClick);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('mousedown', this._handleOutsideClick);
  }

  private _handleOutsideClick = (ev: MouseEvent): void => {
    if (!this._activeColorPicker) {
      return;
    }

    const path = ev.composedPath();

    // If the click was on any trigger or inside any popup, do nothing.
    if (
      path.some(
        (el) =>
          el instanceof HTMLElement &&
          (el.classList.contains('color-input-wrapper') || el.classList.contains('color-picker-popup')),
      )
    ) {
      return;
    }

    // Otherwise, the click was outside, so close the picker.
    const popups = this.renderRoot.querySelectorAll<HTMLElement>('.color-picker-popup');
    popups.forEach((p) => (p.style.display = 'none'));
    this._activeColorPicker = null;
  };

  private _toggleColorPicker(ev: MouseEvent, pickerId: string): void {
    ev.stopPropagation();
    const targetPopup = this.renderRoot.querySelector<HTMLElement>(`.color-picker-popup[data-picker-id="${pickerId}"]`);
    if (!targetPopup) return;

    const isVisible = targetPopup.style.display !== 'none';

    // Hide all popups first
    const allPopups = this.renderRoot.querySelectorAll<HTMLElement>('.color-picker-popup');
    allPopups.forEach((p) => (p.style.display = 'none'));

    // If the target was not visible, show it.
    if (!isVisible) {
      targetPopup.style.display = 'block';
      this._activeColorPicker = pickerId;
    } else {
      this._activeColorPicker = null;
    }
  }

  private _handleColorModeChange(ev: Event): void {
    const newMode = (ev.target as HTMLSelectElement).value;
    const oldMode = (this._config.color_thresholds?.length ?? 0) > 0 ? 'threshold' : 'single';

    if (newMode === oldMode || !this._config) return;

    const newConfig = { ...this._config };

    if (newMode === 'threshold') {
      if (!newConfig.color_thresholds || newConfig.color_thresholds.length === 0) {
        newConfig.color_thresholds = [{ value: 0, color: '#000000' }];
      }
    } else {
      newConfig.color_thresholds = [];
    }

    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });
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
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });
  }

  private _entityAttributeChanged(ev: Event): void {
    const target = ev.target as HTMLElement & { value?: string; type?: string };
    const index = Number(target.dataset.index);
    const field = target.dataset.field as keyof EntityConfig;

    if (!this._config || isNaN(index) || !field) return;

    let value: string | number | undefined = (ev as CustomEvent).detail?.value ?? target.value;

    if (target.tagName.toLowerCase() === 'ha-slider' || target.type === 'number') {
      value = target.value === '' ? undefined : Number(target.value);
    }

    const newEntities = [...this._config.entities];
    const newEntityConf = { ...newEntities[index] };

    if (value === '' || value === undefined || (typeof value === 'number' && isNaN(value))) {
      delete newEntityConf[field];
    } else {
      newEntityConf[field] = value as never;
    }

    newEntities[index] = newEntityConf;

    const newConfig = { ...this._config, entities: newEntities };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });
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
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });
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
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });
  }

  private _addThreshold(): void {
    if (!this._config) return;
    const newThresholds = [...this._config.color_thresholds, { value: 0, color: '#000000' }];
    const newConfig = { ...this._config, color_thresholds: newThresholds };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });
  }

  private _removeThreshold(index: number): void {
    if (!this._config) return;
    const newThresholds = [...this._config.color_thresholds];
    newThresholds.splice(index, 1);
    const newConfig = { ...this._config, color_thresholds: newThresholds };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });
  }

  private _handleEntityColorModeChange(ev: Event, index: number): void {
    const newMode = (ev.target as HTMLSelectElement).value;
    const entityConf = this._config.entities[index];
    const oldMode = (entityConf.color_thresholds?.length ?? 0) > 0 ? 'threshold' : 'single';

    if (newMode === oldMode) return;

    const newEntities = [...this._config.entities];
    const newEntityConf = { ...newEntities[index] };

    if (newMode === 'threshold') {
      delete newEntityConf.line_color;
      if (!newEntityConf.color_thresholds || newEntityConf.color_thresholds.length === 0) {
        newEntityConf.color_thresholds = [{ value: 0, color: '#000000' }];
      }
    } else {
      delete newEntityConf.color_thresholds;
    }

    newEntities[index] = newEntityConf;

    const newConfig = { ...this._config, entities: newEntities };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });
  }

  private _entityThresholdChanged(ev: Event, entityIndex: number, thresholdIndex: number): void {
    if (!this._config) return;

    const target = ev.target as ThresholdEventTarget;
    const field = target.dataset.field as keyof ColorThreshold;
    const isColorPicker = target.tagName.toLowerCase().includes('color-picker');
    const value = isColorPicker ? (ev as CustomEvent).detail.value : target.value;

    const newEntities = [...this._config.entities];
    const entityConf = { ...newEntities[entityIndex] };
    const newThresholds = [...(entityConf.color_thresholds || [])];

    newThresholds[thresholdIndex] = {
      ...newThresholds[thresholdIndex],
      [field]: field === 'value' ? Number(value) : value,
    };

    entityConf.color_thresholds = newThresholds;
    newEntities[entityIndex] = entityConf;

    const newConfig = { ...this._config, entities: newEntities };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });
  }

  private _addEntityThreshold(entityIndex: number): void {
    if (!this._config) return;
    const newEntities = [...this._config.entities];
    const entityConf = { ...newEntities[entityIndex] };
    const newThresholds = [...(entityConf.color_thresholds || []), { value: 0, color: '#000000' }];
    entityConf.color_thresholds = newThresholds;
    newEntities[entityIndex] = entityConf;

    const newConfig = { ...this._config, entities: newEntities };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });
  }

  private _removeEntityThreshold(entityIndex: number, thresholdIndex: number): void {
    if (!this._config) return;
    const newEntities = [...this._config.entities];
    const entityConf = { ...newEntities[entityIndex] };
    const newThresholds = [...(entityConf.color_thresholds || [])];
    newThresholds.splice(thresholdIndex, 1);

    if (newThresholds.length === 0) {
      delete entityConf.color_thresholds;
    } else {
      entityConf.color_thresholds = newThresholds;
    }

    newEntities[entityIndex] = entityConf;

    const newConfig = { ...this._config, entities: newEntities };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });
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
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });

    this._draggedThresholdIndex = null;
    this._dropThresholdIndex = null;
  }

  private _handleEntityThresholdDragStart(ev: DragEvent, index: number): void {
    this._draggedThresholdIndex = index;
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
  }

  private _handleEntityThresholdDragOver(ev: DragEvent, index: number): void {
    ev.preventDefault();
    if (index !== this._draggedThresholdIndex) this._dropThresholdIndex = index;
  }

  private _handleEntityThresholdDrop(ev: DragEvent, entityIndex: number): void {
    ev.preventDefault();
    if (this._draggedThresholdIndex === null || this._dropThresholdIndex === null) return;

    const newEntities = [...this._config.entities];
    const entityConf = { ...newEntities[entityIndex] };
    const newThresholds = [...(entityConf.color_thresholds || [])];
    const [draggedItem] = newThresholds.splice(this._draggedThresholdIndex, 1);
    newThresholds.splice(this._dropThresholdIndex, 0, draggedItem);

    entityConf.color_thresholds = newThresholds;
    newEntities[entityIndex] = entityConf;

    const newConfig = { ...this._config, entities: newEntities };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });

    this._draggedThresholdIndex = null;
    this._dropThresholdIndex = null;
  }

  private _handleDragStart(ev: DragEvent, index: number): void {
    this._draggedIndex = index;
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      // Required for Firefox to initiate drag
      ev.dataTransfer.setData('text/plain', String(index));
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
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });

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
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });
  }

  private _removeEntity(index: number): void {
    const newEntities = [...this._config.entities];
    newEntities.splice(index, 1);
    const newConfig = { ...this._config, entities: newEntities };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });
  }

  private _overwriteAppearanceChanged(ev: Event): void {
    const target = ev.target as HTMLInputElement;
    const index = Number((target as HTMLElement).dataset.index);
    const checked = target.checked;

    if (!this._config || isNaN(index)) return;

    const newEntities = [...this._config.entities];
    const newEntityConf = { ...newEntities[index] };

    if (checked) {
      newEntityConf.overwrite_graph_appearance = true;
    } else {
      delete newEntityConf.overwrite_graph_appearance;
      delete newEntityConf.line_color;
      delete newEntityConf.line_opacity;
      delete newEntityConf.color_thresholds;
    }

    newEntities[index] = newEntityConf;

    const newConfig = { ...this._config, entities: newEntities };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig as BackgroundGraphEntitiesConfig });
    this.requestUpdate();
  }

  private _editEntity(index: number): void {
    this._editingIndex = index;
    this.requestUpdate();
  }

  private _goBack(): void {
    this._editingIndex = null;
    this.requestUpdate();
  }

  private _renderEntityEditor(): TemplateResult {
    if (this._editingIndex === null) return html``;

    const entityConf = this._config.entities[this._editingIndex];
    if (!entityConf) return html``;

    const overwriteAppearance = entityConf.overwrite_graph_appearance ?? false;

    return html`
      <div class="header">
        <ha-icon-button
          .path=${'M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z'}
          @click=${this._goBack}
        ></ha-icon-button>
        <span class="title">${entityConf.name || entityConf.entity}</span>
      </div>
      <div class="card-config">
        <ha-textfield
          .label=${localize(this.hass, 'component.bge.editor.name')}
          .value=${entityConf.name || ''}
          .configValue=${'name'}
          data-index=${this._editingIndex}
          data-field="name"
          @change=${this._entityAttributeChanged}
        ></ha-textfield>
        <ha-icon-picker
          .hass=${this.hass}
          .label=${localize(this.hass, 'component.bge.editor.icon')}
          .value=${entityConf.icon || ''}
          data-index=${this._editingIndex}
          data-field="icon"
          @value-changed=${this._entityAttributeChanged}
        ></ha-icon-picker>

        <ha-formfield .label=${localize(this.hass, 'component.bge.editor.optional_overrides')}>
          <ha-switch
            .checked=${overwriteAppearance}
            data-index=${this._editingIndex}
            @change=${this._overwriteAppearanceChanged}
          ></ha-switch>
        </ha-formfield>

        ${overwriteAppearance ? this._renderEntityGraphAppearanceEditor(this._editingIndex) : ''}
      </div>
    `;
  }

  private _renderEntityGraphAppearanceEditor(index: number): TemplateResult {
    const entityConf = this._config.entities[index];
    if (!entityConf) return html``;

    const colorMode = (entityConf.color_thresholds?.length ?? 0) > 0 ? 'threshold' : 'single';
    const isDarkMode = this.hass.themes?.darkMode ?? false;
    const defaultLineColor = isDarkMode ? 'white' : 'black';
    const finalLineColor = entityConf.line_color || this._config.line_color || defaultLineColor;

    return html`
      <div class="overrides">
        <h3>${localize(this.hass, 'component.bge.editor.graph_appearance')}</h3>

        <div class="opacity-slider-container">
          <div class="label-container">
            <span>${localize(this.hass, 'component.bge.editor.line_opacity')}</span>
            <span>${Number(entityConf.line_opacity ?? this._config.line_opacity ?? 0.2).toFixed(2)}</span>
          </div>
          <ha-slider
            min="0.1"
            max="0.8"
            step="0.05"
            .value=${entityConf.line_opacity ?? this._config.line_opacity ?? 0.2}
            data-index=${index}
            data-field="line_opacity"
            @change=${this._entityAttributeChanged}
            pin
          ></ha-slider>
        </div>

        <ha-select
          .label=${localize(this.hass, 'component.bge.editor.color_mode')}
          .value=${colorMode}
          @selected=${(e: Event) => this._handleEntityColorModeChange(e, index)}
          @closed=${(ev: Event) => ev.stopPropagation()}
        >
          <mwc-list-item value="single">${localize(this.hass, 'component.bge.editor.color_mode_single')}</mwc-list-item>
          <mwc-list-item value="threshold"
            >${localize(this.hass, 'component.bge.editor.color_mode_threshold')}</mwc-list-item
          >
        </ha-select>

        ${colorMode === 'single'
          ? html`
              <div
                class="color-input-wrapper"
                data-picker-id="entity_line_color_${index}"
                @mousedown=${(e: MouseEvent) => this._toggleColorPicker(e, `entity_line_color_${index}`)}
              >
                <ha-textfield
                  .label=${localize(this.hass, 'component.bge.editor.line_color')}
                  .value=${entityConf.line_color ?? ''}
                  .placeholder=${this._config.line_color || defaultLineColor}
                  data-index=${index}
                  data-field="line_color"
                  @change=${this._entityAttributeChanged}
                ></ha-textfield>
                <div class="color-preview" style="background-color: ${finalLineColor}"></div>
                <div
                  class="color-picker-popup"
                  data-picker-id="entity_line_color_${index}"
                  @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                >
                  <rgb-string-color-picker
                    .color=${finalLineColor}
                    data-index=${index}
                    data-field="line_color"
                    @color-changed=${this._entityAttributeChanged}
                    alpha
                  ></rgb-string-color-picker>
                </div>
              </div>
            `
          : this._renderEntityThresholdsEditor(index)}
      </div>
    `;
  }

  private _renderEntityThresholdsEditor(entityIndex: number): TemplateResult {
    const entityConf = this._config.entities[entityIndex];
    if (!entityConf) return html``;

    return html`
      <div>
        <h4>${localize(this.hass, 'component.bge.editor.color_thresholds')}</h4>
        <div class="entities-container">
          ${(entityConf.color_thresholds || []).map(
            (threshold, index) => html`
              <div
                class="entity-container threshold-container ${this._dropThresholdIndex === index
                  ? 'drag-over'
                  : ''} ${this._draggedThresholdIndex === index ? 'dragging' : ''}"
                draggable="true"
                @dragstart=${(e: DragEvent) => this._handleEntityThresholdDragStart(e, index)}
                @dragover=${(e: DragEvent) => this._handleEntityThresholdDragOver(e, index)}
                @dragleave=${() => (this._dropThresholdIndex = null)}
                @drop=${(e: DragEvent) => this._handleEntityThresholdDrop(e, entityIndex)}
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
                    @change=${(e: Event) => this._entityThresholdChanged(e, entityIndex, index)}
                  ></ha-textfield>
                  <div
                    class="color-input-wrapper"
                    data-picker-id=${`entity_${entityIndex}_threshold_${index}`}
                    @mousedown=${(e: MouseEvent) =>
                      this._toggleColorPicker(e, `entity_${entityIndex}_threshold_${index}`)}
                  >
                    <ha-textfield
                      .label=${localize(this.hass, 'component.bge.editor.color')}
                      .value=${threshold.color}
                      data-field="color"
                      @change=${(e: Event) => this._entityThresholdChanged(e, entityIndex, index)}
                    ></ha-textfield>
                    <div class="color-preview" style="background-color: ${threshold.color}"></div>
                    <div
                      class="color-picker-popup"
                      data-picker-id=${`entity_${entityIndex}_threshold_${index}`}
                      @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                    >
                      <rgb-string-color-picker
                        .color=${threshold.color}
                        data-field="color"
                        @color-changed=${(e: CustomEvent) => this._entityThresholdChanged(e, entityIndex, index)}
                        alpha
                      ></rgb-string-color-picker>
                    </div>
                  </div>
                </div>
                <ha-icon-button
                  class="remove-icon"
                  .path=${'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z'}
                  @click=${() => this._removeEntityThreshold(entityIndex, index)}
                ></ha-icon-button>
              </div>
            `,
          )}
        </div>
        <ha-button @click=${() => this._addEntityThreshold(entityIndex)}>
          ${localize(this.hass, 'component.bge.editor.add_threshold')}
        </ha-button>
      </div>
    `;
  }

  protected render(): TemplateResult {
    if (!this.hass || !this._config) {
      return html`<div>Waiting for config…</div>`;
    }

    if (this._editingIndex !== null) {
      return this._renderEntityEditor();
    }

    return this._renderMainConfig();
  }

  private _renderMainConfig(): TemplateResult {
    const colorMode = (this._config.color_thresholds?.length ?? 0) > 0 ? 'threshold' : 'single';
    const isDarkMode = this.hass.themes?.darkMode ?? false;
    const defaultLineColor = isDarkMode ? 'white' : 'black';

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
            .value=${String(this._config.line_width ?? 3)}
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

        <div class="opacity-slider-container">
          <div class="label-container">
            <span>${localize(this.hass, 'component.bge.editor.line_opacity')}</span>
            <span>${Number(this._config.line_opacity ?? 0.2).toFixed(2)}</span>
          </div>
          <ha-slider
            min="0.1"
            max="0.8"
            step="0.05"
            .value=${this._config.line_opacity ?? 0.2}
            .configValue=${'line_opacity'}
            @change=${this._valueChanged}
            pin
          ></ha-slider>
        </div>

        <div class="side-by-side">
          <ha-select
            .label=${localize(this.hass, 'component.bge.editor.color_mode')}
            .value=${colorMode}
            @selected=${this._handleColorModeChange}
            @closed=${(ev: Event) => ev.stopPropagation()}
          >
            <mwc-list-item value="single"
              >${localize(this.hass, 'component.bge.editor.color_mode_single')}</mwc-list-item
            >
            <mwc-list-item value="threshold"
              >${localize(this.hass, 'component.bge.editor.color_mode_threshold')}</mwc-list-item
            >
          </ha-select>
        </div>

        ${colorMode === 'single'
          ? html`
              <div
                class="color-input-wrapper"
                data-picker-id="line_color"
                @mousedown=${(e: MouseEvent) => this._toggleColorPicker(e, 'line_color')}
              >
                <ha-textfield
                  .label=${localize(this.hass, 'component.bge.editor.line_color')}
                  .value=${this._config.line_color || defaultLineColor}
                  .configValue=${'line_color'}
                  @change=${this._valueChanged}
                ></ha-textfield>
                <div
                  class="color-preview"
                  style="background-color: ${this._config.line_color || defaultLineColor}"
                ></div>
                <div
                  class="color-picker-popup"
                  data-picker-id="line_color"
                  @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                >
                  <rgb-string-color-picker
                    .color=${this._config.line_color || defaultLineColor}
                    .configValue=${'line_color'}
                    @color-changed=${this._colorPicked}
                    alpha
                  ></rgb-string-color-picker>
                </div>
              </div>
            `
          : html`
              <div>
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
                          <div
                            class="color-input-wrapper"
                            data-picker-id=${`threshold_${index}`}
                            @mousedown=${(e: MouseEvent) => this._toggleColorPicker(e, `threshold_${index}`)}
                          >
                            <ha-textfield
                              .label=${localize(this.hass, 'component.bge.editor.color')}
                              .value=${threshold.color}
                              data-field="color"
                              data-index=${String(index)}
                              @change=${(e: Event) => this._thresholdChanged(e, index)}
                            ></ha-textfield>
                            <div class="color-preview" style="background-color: ${threshold.color}"></div>
                            <div
                              class="color-picker-popup"
                              data-picker-id=${`threshold_${index}`}
                              @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                            >
                              <rgb-string-color-picker
                                .color=${threshold.color}
                                data-field="color"
                                @color-changed=${(e: CustomEvent) => this._thresholdChanged(e, index)}
                                alpha
                              ></rgb-string-color-picker>
                            </div>
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
              </div>
            `}

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
                @dragover=${(e: DragEvent) => this._handleDragOver(e, index)}
                @dragleave=${this._handleDragLeave}
                @drop=${this._handleDrop}
                @dragend=${this._handleDragEnd}
              >
                <div
                  class="drag-handle"
                  draggable="true"
                  @dragstart=${(e: DragEvent) => this._handleDragStart(e, index)}
                >
                  <ha-icon .icon=${'mdi:drag-vertical'}></ha-icon>
                </div>
                <div class="entity-content">
                  <div class="entity-main">
                    <ha-entity-picker
                      .hass=${this.hass}
                      .value=${entity.entity}
                      data-index=${index}
                      data-field="entity"
                      @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                      @value-changed=${this._entityAttributeChanged}
                      allow-custom-entity
                    ></ha-entity-picker>
                    <ha-icon-button
                      class="edit-icon"
                      .path=${'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z'}
                      @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                      @click=${() => this._editEntity(index)}
                    ></ha-icon-button>
                    <ha-icon-button
                      class="remove-icon"
                      .path=${'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z'}
                      @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                      @click=${() => this._removeEntity(index)}
                    ></ha-icon-button>
                  </div>
                </div>
              </div>
            `,
          )}
        </div>
        <ha-button @click=${this._addEntity}> ${localize(this.hass, 'component.bge.editor.add_entity')} </ha-button>
      </div>
    `;
  }

  static styles = css`
    ${unsafeCSS(editorStyles)}
  `;
}
