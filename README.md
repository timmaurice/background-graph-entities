# Background Graph Entities Custom Component

[![hacs_badge](https://img.shields.io/badge/HACS-Default-41BDF5.svg?style=for-the-badge)](https://github.com/timmaurice/lovelace-background-graph-entities)
![GitHub release (latest by date)](https://img.shields.io/github/downloads/timmaurice/lovelace-background-graph-entities/total?style=for-the-badge)
![Release](https://img.shields.io/github/v/release/timmaurice/lovelace-background-graph-entities?style=for-the-badge)

## Overview

The `background-graph-entities` custom component for Home Assistant displays a list of entities with their current state and a mini graph showing the entity's history. This component is ideal for monitoring various sensor data, such as temperature, humidity, or other metrics.

![Screenshot of the Background Graph Entities Custom Component](https://raw.githubusercontent.com/timmaurice/lovelace-background-graph-entities/refs/heads/main/image.png)

## Features

- Displays current state and mini graph for each entity
- Supports custom icons for each entity
- Click on an entity to open the detailed info popup
- Configurable graph settings for each entity

## Installation

1. Ensure you have HACS installed.
2. Make sure you have [mini-graph-card](https://github.com/kalkih/mini-graph-card) installed.
3. Add this repository to HACS custom repositories.
   ```yaml
   Repository: https://github.com/timmaurice/lovelace-background-graph-entities
   Type: Dashboard
   ```
4. Install `background-graph-entities` via HACS.<br>
   [![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=timmaurice&repository=lovelace-background-graph-entities&category=Dashboard)

## Usage

Add the custom component to your Lovelace configuration. Below is an example configuration for using the `background-graph-entities` component:

```yaml
type: custom:background-graph-entities
entities:
  - entity: sensor.temperature_outside
    name: Temperature Outside
    icon: mdi:thermometer
  - entity: sensor.temperature_sensor_average_inside
    name: Temperature Average Inside
```

### Configuration Options

- **entities**: A list of entity configurations.
  - **entity**: The entity ID.
  - **name** (optional): The display name of the entity.
  - **icon** (optional): The icon for the entity. Can be overwritten with [material design icons](https://pictogrammers.com/library/mdi/)<br>e.g.: `mdi:alert`
- **hoursToShow** (optional): Number of hours to show in the mini graph. Defaults to 24.
- **title** (optional): A title for the card.
- **line_length** (optional): Length of the line in the mini graph. Default is "long" the other option is "short".
- **line_color** (optional): Color of the line in the mini graph. Default is `var(--primary-text-color)`.
- **line_opacity** (optional): Opacity of the mini graph line. Default is `0.2`.
- **line_width** (optional): Width of the line in the mini graph in pixels. Default is `2`.

### Example

#### Simplified Configuration _(from v0.0.7)_

For a quicker setup, you can also provide a simple list of entity IDs directly. The card will use the entity's default name.

```yaml
type: custom:background-graph-entities
entities:
  - sensor.my_sensor
  - sensor.another_sensor
```

#### Full config example

```yaml
type: custom:background-graph-entities
title: Travel Times
entities:
  - entity: sensor.travel_time_to_nyc
    name: New York City
    line_opacity: 0.3
  - entity: sensor.temperature_sensor_average_inside
    name: Temperature Average Inside
    icon: mdi:home-thermometer
hoursToShow: 24
line_width: 3
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
