# Background Graph Entities Custom Component

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=flat-square)](https://github.com/hacs/integration)
![GitHub release (latest by date)](https://img.shields.io/github/v/release/timmaurice/lovelace-background-graph-entities?style=flat-square)
[![GH-downloads](https://img.shields.io/github/downloads/timmaurice/lovelace-background-graph-entities/total?style=flat-square)](https://github.com/timmaurice/lovelace-background-graph-entities/releases)
[![GH-last-commit](https://img.shields.io/github/last-commit/timmaurice/lovelace-background-graph-entities.svg?style=flat-square)](https://github.com/timmaurice/lovelace-background-graph-entities/commits/master)
[![GH-code-size](https://img.shields.io/github/languages/code-size/timmaurice/lovelace-background-graph-entities.svg?color=red&style=flat-square)](https://github.com/timmaurice/lovelace-background-graph-entities)
![GitHub](https://img.shields.io/github/license/timmaurice/lovelace-background-graph-entities?style=flat-square)

## Overview

The `background-graph-entities` custom component for Home Assistant displays a list of entities with their current state and a mini graph showing the entity's history. This component is ideal for monitoring various sensor data, such as temperature, humidity, or other metrics.

<p align="center">
  <img src="https://raw.githubusercontent.com/timmaurice/lovelace-background-graph-entities/main/image.png" alt="Card Screenshot" width="260">
  <img src="https://raw.githubusercontent.com/timmaurice/lovelace-background-graph-entities/main/image-entity.png" alt="Entity Editor Screenshot" width="260">
  <img src="https://raw.githubusercontent.com/timmaurice/lovelace-background-graph-entities/main/image-color-thresholds.png" alt="Color Thresholds Editor Screenshot" width="260">
</p>

## Features

- **Dynamic Background Graphs:** Each entity row features a beautiful, live-updating graph of its history as a background, with smooth, rounded lines.
- **Highly Customizable:**
  - **Global & Per-Entity Styling:** Configure graph appearance globally or override settings for each entity individually.
  - **Dynamic Line Colors:** Use a single color or define value-based thresholds to create stunning color gradients.
  - **Adjustable Graph Appearance:** Control line width, opacity, and an optional glow effect to match your dashboard's theme.
  - **Multiple Curve Styles:** Choose between `spline` (default), `linear`, or `step` curves to customize the graph's appearance.
- **Powerful UI Editor:** A user-friendly editor makes configuration a breeze.
  - **Drag & Drop:** Easily reorder entities and color thresholds.
  - **Live Previews:** See your changes instantly.
  - **Color Pickers:** Choose colors with ease.
- **Interactive Editing:** Dots appear on the graph only in edit mode, helping you visualize the data points without cluttering the normal view.
- **Performance-Tuned:**
  - **Data Downsampling:** Configure `points_per_hour` to show smooth graphs over long periods without slowing down your browser.
  - **Configurable Update Interval:** Control how often data is fetched.
- **User-Friendly:**
  - **Clickable Entities:** Tap any entity to open its "More Info" dialog.
  - **Smart Formatting:** Automatically formats time-based sensors (e.g., travel time) into a human-readable format.

## Installation

1. Ensure you have HACS installed.
2. Add this repository to HACS as a custom repository.
   ```yaml
   Repository: https://github.com/timmaurice/lovelace-background-graph-entities
   Type: Dashboard
   ```
3. Install `background-graph-entities` via HACS.<br>
   [![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=timmaurice&repository=lovelace-background-graph-entities&category=Dashboard)

## Configuration

This card can be configured via the UI editor or by using YAML.

### UI Editor

The card is fully configurable through the UI editor.

1.  Add a new card to your dashboard.
2.  Search for "Background Graph Entities" and select it.
3.  Use the editor to configure the card title, entities, and global graph appearance.
4.  To customize an individual entity, click the "Edit" icon next to it in the entity list.

### YAML Configuration

#### Card Options

| Name               | Type    | Default                          | Description                                                                                                                                                                                                                           |
| ------------------ | ------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`             | string  | **Required**                     | `custom:background-graph-entities`                                                                                                                                                                                                    |
| `title`            | string  | `''`                             | The title of the card.                                                                                                                                                                                                                |
| `hours_to_show`    | number  | `24`                             | The number of hours of history to display in the graphs.                                                                                                                                                                              |
| `line_width`       | number  | `3`                              | The width of the graph line in pixels.                                                                                                                                                                                                |
| `line_opacity`     | number  | `0.2`                            | The opacity of the graph line (from 0.1 to 0.8).                                                                                                                                                                                      |
| `line_color`       | string  | `white` (dark) / `black` (light) | The color of the graph line. Can be any valid CSS color. Ignored if `color_thresholds` is used.                                                                                                                                       |
| `line_length`      | string  | `long`                           | The length of the graph. Can be `long` or `short`. `short` provides more space for the entity value.                                                                                                                                  |
| `line_glow`        | boolean | `false`                          | Adds a subtle glow effect to the graph line.                                                                                                                                                                                          |
| `curve`            | string  | `spline`                         | The interpolation type for the graph line. Can be `spline`, `linear`, or `step`.                                                                                                                                                      |
| `color_thresholds` | list    | `[]`                             | A list of color thresholds to create a gradient line. See Advanced Example.                                                                                                                                                           |
| `points_per_hour`  | number  | `1`                              | The number of time buckets per hour. The card calculates the median value for each bucket and fills in any gaps with the last known value to create a continuous graph. Higher values provide more detail but may impact performance. |
| `update_interval`  | number  | `600`                            | How often to fetch history data, in seconds (e.g., 600 = 10 minutes).                                                                                                                                                                 |

#### Entity Options

Each entry in the `entities` list can be a string (the entity ID) or an object with more specific configurations.

| Name                         | Type    | Default                   | Description                                                                                               |
| ---------------------------- | ------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `entity`                     | string  | **Required**              | The ID of the entity to display.                                                                          |
| `name`                       | string  | Entity's friendly name    | A custom name for the entity.                                                                             |
| `icon`                       | string  | Entity's icon             | A custom icon for the entity (e.g., `mdi:thermometer`).                                                   |
| `overwrite_graph_appearance` | boolean | `false`                   | Set to `true` to enable entity-specific graph settings below. Required for per-entity overrides to apply. |
| `line_color`                 | string  | Global `line_color`       | Overrides the global `line_color` for this entity only.                                                   |
| `line_opacity`               | number  | Global `line_opacity`     | Overrides the global `line_opacity` for this entity only.                                                 |
| `color_thresholds`           | list    | Global `color_thresholds` | Overrides the global `color_thresholds` for this entity only.                                             |

### Examples

#### 1. Minimal Configuration

The simplest way to use the card is by providing a list of entity IDs.

```yaml
type: custom:background-graph-entities
entities:
  - sensor.outside_temperature
  - sensor.living_room_humidity
```

#### 2. Basic Configuration

This example sets a title and customizes the appearance of all graphs.

```yaml
type: custom:background-graph-entities
title: Office Sensors
hours_to_show: 48
line_width: 2
line_color: 'var(--primary-color)'
line_opacity: 0.3
entities:
  - entity: sensor.office_temperature
    name: Temperature
    icon: mdi:thermometer
  - entity: sensor.office_humidity
    name: Humidity
    icon: mdi:water-percent
```

#### 3. Advanced Configuration with Overrides

This example demonstrates how to use global settings and override them for specific entities.

```yaml
type: custom:background-graph-entities
title: Advanced Sensor Graphs
hours_to_show: 72
line_color: '#9da0a2' # A default grey color for graphs
line_width: 2
line_opacity: 0.2
curve: linear
line_glow: true
entities:
  # This entity uses the global settings
  - entity: sensor.living_room_temperature

  # This entity has its own line color and opacity
  - entity: sensor.bedroom_temperature
    overwrite_graph_appearance: true
    line_color: '#3498db' # blue
    line_opacity: 0.5

  # This entity uses color thresholds, which creates a gradient
  - entity: sensor.co2_level
    name: CO2 Level
    overwrite_graph_appearance: true
    color_thresholds:
      - value: 400
        color: '#2ecc71' # green
      - value: 1000
        color: '#f1c40f' # yellow
      - value: 2000
        color: '#e74c3c' # red
```

## Development

To contribute to the development, you'll need to set up a build environment.

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/timmaurice/lovelace-background-graph-entities.git
    cd lovelace-background-graph-entities
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Start the development server:**
    This command will watch for changes in the `src` directory and automatically rebuild the card.

    ```bash
    npm run watch
    ```

4.  In your Home Assistant instance, you will need to configure Lovelace to use the local development version of the card from `dist/background-graph-entities.js`.

---

For further assistance or to report issues, please visit the [GitHub repository](https://github.com/timmaurice/lovelace-background-graph-entities).
