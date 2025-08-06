import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { BackgroundGraphEntities } from '../src/background-graph-entities';
import { HomeAssistant, BackgroundGraphEntitiesConfig } from '../src/types';

// Define the custom element if it's not already defined.
// This prevents errors when running multiple test files.
if (!customElements.get('background-graph-entities')) {
  customElements.define('background-graph-entities', BackgroundGraphEntities);
}

// Define a minimal interface for the ha-card element to satisfy TypeScript
interface HaCard extends HTMLElement {
  header?: string;
}

describe('BackgroundGraphEntities', () => {
  let element: BackgroundGraphEntities;
  let hass: HomeAssistant;
  let config: BackgroundGraphEntitiesConfig;

  // Mock element dimensions for JSDOM. D3 requires a sized container to render.
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 100 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 50 });
  });

  beforeEach(() => {
    // Mock the Home Assistant object
    hass = {
      states: {
        'sensor.test': {
          entity_id: 'sensor.test',
          state: '123',
          attributes: {
            friendly_name: 'Test Sensor',
            unit_of_measurement: '°C',
          },
        },
      },
      localize: (key: string) => key,
      language: 'en',
      themes: { darkMode: false },
      callWS: vi.fn().mockResolvedValue({ 'sensor.test': [] }),
    };

    // Mock a basic card configuration
    config = {
      type: 'custom:background-graph-entities',
      entities: ['sensor.test'],
    };

    // Create the element and add it to the DOM
    element = document.createElement('background-graph-entities') as BackgroundGraphEntities;
    document.body.appendChild(element);
  });

  afterEach(() => {
    document.body.removeChild(element);
  });

  it('should create the component instance', () => {
    expect(element).toBeInstanceOf(BackgroundGraphEntities);
  });

  it('should render a ha-card with a title if provided', async () => {
    element.hass = hass;
    element.setConfig({ ...config, title: 'My Test Card' });
    await element.updateComplete;

    const card = element.shadowRoot?.querySelector<HaCard>('ha-card');
    expect(card).not.toBeNull();
    expect(card?.header).toBe('My Test Card');
  });

  it('should throw an error if no entities are provided in config', () => {
    expect(() => element.setConfig({ type: 'custom:background-graph-entities', entities: [] })).toThrow(
      'You need to define at least one entity',
    );
  });

  it('should render an unavailable entity row correctly', async () => {
    // Use a config with an entity that is not in the hass object
    element.setConfig({
      type: 'custom:background-graph-entities',
      entities: ['sensor.unavailable'],
    });
    element.hass = hass;
    await element.updateComplete;

    const row = element.shadowRoot?.querySelector('.entity-row');
    expect(row).not.toBeNull();
    expect(row?.classList.contains('unavailable')).toBe(true);

    const icon = row?.querySelector('ha-icon');
    expect(icon?.getAttribute('icon')).toBe('mdi:alert-circle-outline');

    const value = row?.querySelector('.entity-value');
    expect(value?.textContent?.trim()).toBe('state.default.unavailable');
  });

  it('should render an svg graph when history is available', async () => {
    // Mock callWS to return some history data
    const historyData = [
      { lu: new Date('2023-01-01T10:00:00Z').getTime() / 1000, s: '10' },
      { lu: new Date('2023-01-01T11:00:00Z').getTime() / 1000, s: '12' },
    ];
    (hass.callWS as Mock).mockResolvedValue({ 'sensor.test': historyData });

    element.hass = hass;
    element.setConfig(config);

    // Wait for the component to update twice: once for the initial render,
    // and a second time after the async history data is fetched and rendered.
    await element.updateComplete;
    await element.updateComplete;

    // Wait for the requestAnimationFrame in `updated()` to fire and render the D3 graph.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const graphContainer = element.shadowRoot?.querySelector('.graph-container');
    const svg = graphContainer?.querySelector('svg');
    expect(svg).not.toBeNull();
  });
});
