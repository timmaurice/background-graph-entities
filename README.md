# Background Graph Entities Custom Component

## Overview

The `background-graph-entities` custom component for Home Assistant displays a list of entities with their current state and a mini graph showing the entity's history. This component is ideal for monitoring various sensor data, such as temperature, humidity, or other metrics.

![Screenshot of the Background Graph Entities Custom Component](https://raw.githubusercontent.com/timmaurice/background-graph-entities/refs/heads/main/image.png)

## Features

- Displays current state and mini graph for each entity
- Supports custom icons for each entity
- Click on an entity to open the detailed info popup
- Configurable graph settings for each entity

## Installation
1. Ensure you have HACS installed.
2. Make sure you have [mini-graph-card](https://github.com/kalkih/mini-graph-card) installed.
3. Add this repository to HACS custom repositories.
4. Install `background-graph-entities` via HACS.
5. Add the following to your Lovelace configuration:
   ```yaml
   resources:
     - url: /hacsfiles/background-graph-entities/background-graph-entities.js
       type: module


## Usage

Add the custom component to your Lovelace configuration. Below is an example configuration for using the `background-graph-entities` component:

```yaml
type: custom:background-graph-entities
entities:
  - entity: sensor.temperature_corfu
    name: Temperature Corfu
    icon: mdi:thermometer
  - entity: sensor.temperature_sensor_average_inside
    name: Temperature Average Inside
```

### Configuration Options

- **entities**: A list of entity configurations.
  - **entity**: The entity ID.
  - **name** (optional): The display name of the entity.
  - **icon** (optional): The icon for the entity. Defaults to `mdi:alert` if not specified.
- **hoursToShow** (optional): Number of hours to show in the mini graph. Defaults to 24.
- **line_color** (optional): Color of the line in the mini graph. Default is "rgba(255, 255, 255, 0.2)".
- **line_width** (optional): Width of the line in the mini graph in pixels. Default is 5.
- **points_per_hour** (optional): Points per hour in the mini graph. Default is 1.
- **update_interval** (optional): Interval of updates in the mini graph. Default is 600.

### Example

```yaml
type: custom:background-graph-entities
entities:
  - entity: sensor.temperature_corfu
    name: Temperature Corfu
    icon: mdi:thermometer
  - entity: sensor.temperature_sensor_average_inside
    name: Temperature Average Inside
    icon: mdi:home-thermometer
hoursToShow: 24
line_color: "rgba(255, 255, 255, 0.2)"
line_width: 5
points_per_hour: 1
update_interval: 600
```

## Development

### Debugging

To debug or make changes to this component:

1. Ensure your development environment is set up with a local instance of Home Assistant.
2. Edit the `background-graph-entities.js` file as needed.
3. Reload the browser or use the `Refresh` button in Home Assistant to see your changes.

---

For further assistance or to report issues, please visit the [GitHub repository](https://github.com/timmaurice/background-graph-entities).