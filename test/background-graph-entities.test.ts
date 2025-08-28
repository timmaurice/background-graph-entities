import { describe, it, expect, beforeEach, afterEach, vi, Mock, beforeAll } from 'vitest';
import { HomeAssistant, BackgroundGraphEntitiesConfig } from '../src/types';
import type { BackgroundGraphEntities as BackgroundGraphEntitiesType } from '../src/background-graph-entities';

// Mock console.info before the module is imported to prevent version logging.
vi.spyOn(console, 'info').mockImplementation(() => {});

// Define a minimal interface for the ha-card element to satisfy TypeScript
interface HaCard extends HTMLElement {
  header?: string;
}

describe('BackgroundGraphEntities', () => {
  let element: BackgroundGraphEntitiesType;
  let hass: HomeAssistant;
  let config: BackgroundGraphEntitiesConfig;
  // This will hold the class constructor at runtime, loaded via dynamic import.
  let BackgroundGraphEntities: new () => BackgroundGraphEntitiesType;

  // Mock element dimensions for JSDOM. D3 requires a sized container to render.
  beforeAll(async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 100 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 50 });

    // Dynamically import the component to get the class constructor.
    // This ensures the console.info mock above is active before the component's
    // module-level code (which includes the log statement) runs.
    const module = await import('../src/background-graph-entities');
    BackgroundGraphEntities = module.BackgroundGraphEntities;
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
      entities: {},
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
    element = document.createElement('background-graph-entities') as BackgroundGraphEntitiesType;
    document.body.appendChild(element);
  });

  afterEach(() => {
    document.body.removeChild(element);
    vi.clearAllMocks();
  });

  describe('Basic Rendering and Configuration', () => {
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

    it('should format the entity state using display_precision', async () => {
      hass.states['sensor.precise'] = {
        entity_id: 'sensor.precise',
        state: '123.4567',
        attributes: {
          friendly_name: 'Precise Sensor',
          unit_of_measurement: 'V',
        },
      };
      hass.entities['sensor.precise'] = {
        entity_id: 'sensor.precise',
        display_precision: 2,
      };
      element.setConfig({
        type: 'custom:background-graph-entities',
        entities: ['sensor.precise'],
      });
      element.hass = hass;
      await element.updateComplete;

      const value = element.shadowRoot?.querySelector('.entity-value');
      expect(value?.textContent?.trim()).toBe('123.46 V');
    });

    it('should format minute values correctly', async () => {
      hass.states['sensor.time_short'] = {
        entity_id: 'sensor.time_short',
        state: '14.56',
        attributes: { friendly_name: 'Short Time', unit_of_measurement: 'min' },
      };
      hass.states['sensor.time_long'] = {
        entity_id: 'sensor.time_long',
        state: '75.5',
        attributes: { friendly_name: 'Long Time', unit_of_measurement: 'min' },
      };
      element.setConfig({
        type: 'custom:background-graph-entities',
        entities: ['sensor.time_short', 'sensor.time_long'],
      });
      element.hass = hass;
      await element.updateComplete;

      const values = element.shadowRoot?.querySelectorAll('.entity-value');
      expect(values).toHaveLength(2);
      expect(values?.[0].textContent?.trim()).toBe('14 min');
      expect(values?.[1].textContent?.trim()).toBe('1h 15min');
    });
  });

  describe('Advanced Features and Overrides', () => {
    const mockNow = new Date('2023-01-01T11:30:00Z');

    beforeEach(() => {
      // Mock Date to control time-based logic in downsampler
      vi.useFakeTimers();
      vi.setSystemTime(mockNow);

      // Ensure editMode is on to render dots for color checks
      element.editMode = true;
      // Mock history for graph rendering
      const startTime = new Date(mockNow.getTime() - 2 * 3600 * 1000); // 2 hours before mockNow
      const historyData = [
        { lu: startTime.getTime() / 1000, s: '5' }, // Start time state
        { lu: new Date('2023-01-01T10:00:00Z').getTime() / 1000, s: '5' }, // value 5, falls in first hour bucket
        { lu: new Date('2023-01-01T11:00:00Z').getTime() / 1000, s: '15' }, // value 15, falls in second hour bucket
      ];
      (hass.callWS as Mock).mockResolvedValue({ 'sensor.test': historyData });

      // Mock requestAnimationFrame to be synchronous. This is necessary because vi.useFakeTimers()
      // breaks the real requestAnimationFrame. We mock it with a setTimeout to make it async,
      // which we can then control with fake timers. This prevents stack overflows that can
      // occur from recursive rAF calls in the component's rendering retry logic.
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        setTimeout(() => cb(0), 1);
        return 0; // Return a dummy number to satisfy the return type
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      // Restore the original requestAnimationFrame
      (window.requestAnimationFrame as Mock).mockRestore();
    });

    it('should return correct card size', () => {
      element.setConfig({
        type: 'custom:background-graph-entities',
        entities: ['sensor.test', 'sensor.test2', 'sensor.test3'],
      });
      expect(element.getCardSize()).toBe(4);
    });

    it('should fire hass-more-info event on entity click', async () => {
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const moreInfoSpy = vi.fn();
      element.addEventListener('hass-more-info', moreInfoSpy);

      const row = element.shadowRoot?.querySelector('.entity-row');
      (row as HTMLElement).click();

      expect(moreInfoSpy).toHaveBeenCalled();
      expect(moreInfoSpy.mock.calls[0][0].detail.entityId).toBe('sensor.test');
    });

    it('should apply line_glow effect when configured', async () => {
      element.hass = hass;
      element.setConfig({ ...config, line_glow: true, hours_to_show: 2, points_per_hour: 1 });
      await element.updateComplete;
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const svg = element.shadowRoot?.querySelector('svg');
      expect(svg, 'SVG element should exist').not.toBeNull();

      const filter = svg?.querySelector('filter');
      expect(filter, 'Filter element should exist for line_glow').not.toBeNull();

      const filterId = filter?.getAttribute('id');
      expect(filterId).toBe('bge-glow-sensor.test');

      const path = svg?.querySelector('path');
      expect(path, 'Path element should exist').not.toBeNull();
      expect(path?.getAttribute('filter')).toBe(`url(#${filterId})`);
    });

    it('should not apply line_glow effect by default', async () => {
      element.hass = hass;
      element.setConfig({ ...config, hours_to_show: 2, points_per_hour: 1 });
      await element.updateComplete;
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const svg = element.shadowRoot?.querySelector('svg');
      expect(svg, 'SVG element should exist').not.toBeNull();

      const filter = svg?.querySelector('filter');
      expect(filter, 'Filter element should not exist by default').toBeNull();

      const path = svg?.querySelector('path');
      expect(path, 'Path element should exist').not.toBeNull();
      expect(path?.getAttribute('filter'), 'Path should not have filter attribute').toBeNull();
    });

    it('should render a spline curve by default', async () => {
      element.hass = hass;
      element.setConfig({ ...config, hours_to_show: 2, points_per_hour: 1 });
      await element.updateComplete;
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const path = element.shadowRoot?.querySelector('path');
      expect(path, 'Path element should exist').not.toBeNull();
      const d = path?.getAttribute('d');
      // curveBasis (spline) uses cubic Bézier curves, which are represented by 'C' in SVG paths.
      expect(d, 'Path "d" attribute should not be null').not.toBeNull();
      expect(d).toContain('C');
    });

    it('should render a linear curve when configured', async () => {
      element.hass = hass;
      element.setConfig({ ...config, curve: 'linear', hours_to_show: 2, points_per_hour: 1 });
      await element.updateComplete;
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const path = element.shadowRoot?.querySelector('path');
      expect(path, 'Path element should exist').not.toBeNull();
      const d = path?.getAttribute('d');
      // curveLinear uses straight line segments, which are 'L' commands. It should not use 'C'.
      expect(d, 'Path "d" attribute should not be null').not.toBeNull();
      expect(d).not.toContain('C');
      expect(d).toContain('L');
    });

    it('should render a step curve when configured', async () => {
      element.hass = hass;
      element.setConfig({ ...config, curve: 'step', hours_to_show: 2, points_per_hour: 1 });
      await element.updateComplete;
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const path = element.shadowRoot?.querySelector('path');
      expect(path, 'Path element should exist').not.toBeNull();
      const d = path?.getAttribute('d');
      // curveStep uses straight line segments, which are 'L' commands. It should not use 'C'.
      expect(d, 'Path "d" attribute should not be null').not.toBeNull();
      expect(d).not.toContain('C');
      expect(d).toContain('L');
    });
  });
});
