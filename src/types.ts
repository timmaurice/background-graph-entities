// A basic representation of the Home Assistant object
export interface HomeAssistant {
  states: { [entity_id: string]: HassEntity };
  localize: (key: string, ...args: unknown[]) => string;
  callWS: <T>(message: { type: string; [key: string]: unknown }) => Promise<T>;
  // You can expand this with more properties from the hass object if needed
}

// A basic representation of a Home Assistant entity state object
export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: {
    friendly_name?: string;
    unit_of_measurement?: string;
    [key: string]: unknown;
  };
}

// A basic representation of a Lovelace card
export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: LovelaceCardConfig): void;
  getCardSize?(): number | Promise<number>;
}

// A basic representation of a Lovelace card configuration
export interface LovelaceCardConfig {
  type: string;
  [key: string]: unknown;
}

export interface LovelaceCardEditor extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: LovelaceCardConfig): void;
}

export interface ColorThreshold {
  value: number;
  color: string;
}

export interface EntityConfig {
  entity: string;
  name?: string;
  icon?: string;
  line_opacity?: number;
  color_thresholds?: ColorThreshold[];
}

export interface BackgroundGraphEntitiesConfig extends LovelaceCardConfig {
  title?: string;
  entities: (string | EntityConfig)[];
  hours_to_show?: number;
  line_length?: 'short' | 'long';
  line_color?: string;
  line_width?: number;
}
