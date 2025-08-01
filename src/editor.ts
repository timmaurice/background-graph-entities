import { LitElement, TemplateResult, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { HomeAssistant, LovelaceCardEditor, BackgroundGraphEntitiesConfig, EntityConfig } from './types';
import { fireEvent } from './utils';

@customElement('background-graph-entities-editor')
export class BackgroundGraphEntitiesEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: BackgroundGraphEntitiesConfig;

  public setConfig(config: BackgroundGraphEntitiesConfig): void {
    this._config = {
      ...config,
      entities: config.entities.map((entityConf) =>
        typeof entityConf === 'string' ? { entity: entityConf } : entityConf,
      ),
    };
  }

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target as HTMLInputElement & { configValue: string };
    let value: string | number | boolean = target.value;

    if (target.type === 'checkbox') {
      value = (ev.target as HTMLInputElement).checked;
    }
    if (target.type === 'number') {
      value = Number(value);
    }

    const configValue = target.configValue;

    if (this._config[configValue] === value) {
      return;
    }

    const newConfig = { ...this._config };
    if (value) {
      newConfig[configValue] = value;
    } else {
      delete newConfig[configValue];
    }

    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _entityChanged(ev: CustomEvent, index: number): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target as HTMLInputElement;
     const newEntities = [...this._config.entities];
    const currentEntity = newEntities[index];
    const newEntity = {
      ...(typeof currentEntity === 'string' ? { entity: currentEntity } : currentEntity),
      entity: target.value,
    };
    newEntities[index] = newEntity;
    fireEvent(this, 'config-changed', { config: { ...this._config, entities: newEntities } });
  }

  private _addEntity(): void {
    if (!this._config) return;
    const newEntities = [...this._config.entities, { entity: '' }];
    fireEvent(this, 'config-changed', { config: { ...this._config, entities: newEntities } });
  }

  private _removeEntity(index: number): void {
    if (!this._config) return;
    const newEntities = [...this._config.entities];
    newEntities.splice(index, 1);
    fireEvent(this, 'config-changed', { config: { ...this._config, entities: newEntities } });
  }

  protected render(): TemplateResult {
    if (!this.hass || !this._config) {
      return html``;
    }

    return html`
      <div class="card-config">
        <ha-textfield
          label="Title (Optional)"
          .value=${this._config.title || ''}
          .configValue=${'title'}
          @input=${this._valueChanged}
        ></ha-textfield>
        <div class="side-by-side">
          <ha-textfield
            label="Hours To Show"
            type="number"
            .value=${this._config.hours_to_show || 24}
            .configValue=${'hours_to_show'}
            @input=${this._valueChanged}
          ></ha-textfield>
          <ha-textfield
            label="Line Width"
            type="number"
            .value=${this._config.line_width || 2}
            .configValue=${'line_width'}
            @input=${this._valueChanged}
          ></ha-textfield>
        </div>
        <h3>Entities</h3>
        ${(this._config.entities as EntityConfig[]).map(
          (entityConf, index) => html`
            <div class="entity-editor">
              <ha-entity-picker
                .hass=${this.hass}
                .value=${entityConf.entity}
                 @value-changed=${(e: CustomEvent) => this._entityChanged(e, index)}
                allow-custom-entity
              ></ha-entity-picker>
              <ha-icon-button
                class="remove-icon"
                .path=${'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z'}
                @click=${() => this._removeEntity(index)}
              ></ha-icon-button>
            </div>
          `,
        )}
        <ha-button @click=${this._addEntity}>Add Entity</ha-button>
        <ha-formfield .label=${'Enable debug logging in browser console'}>
          <ha-switch
            .checked=${this._config.debug || false}
            .configValue=${'debug'}
            @change=${this._valueChanged}
          ></ha-switch>
        </ha-formfield>
      </div>
    `;
  }

  static styles = css`
    .card-config {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .side-by-side {
      display: flex;
      gap: 16px;
    }
    .entity-editor {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  `;
}
