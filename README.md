# Background Graph Entities Custom Component

## Overview

The `background-graph-entities` custom component for Home Assistant displays a list of entities with their current state and a mini graph showing the entity's history. This component is ideal for monitoring various sensor data, such as temperature, humidity, or other metrics.

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
  - entity: sensor.temperaturesensor_average_inside
    name: Temperature Average Inside
```

### Configuration Options

- **entities**: A list of entity configurations.
  - **entity**: The entity ID.
  - **name** (optional): The display name of the entity.
  - **icon** (optional): The icon for the entity. Defaults to `mdi:alert` if not specified.
- **hoursToShow** (optional): Number of hours to show in the mini graph. Defaults to 24.

### Example

```yaml
type: custom:background-graph-entities
entities:
  - entity: sensor.temperature_corfu
    name: Temperature Corfu
    icon: mdi:thermometer
  - entity: sensor.temperaturesensor_average_inside
    name: Temperature Average Inside
    icon: mdi:home-thermometer
hoursToShow: 12
```

## Development

### Debugging

To debug or make changes to this component:

1. Ensure your development environment is set up with a local instance of Home Assistant.
2. Edit the `background-graph-entities.js` file as needed.
3. Reload the browser or use the `Refresh` button in Home Assistant to see your changes.

### Refresh Component

If a configuration update is detected, the component automatically refreshes:

```javascript
window.addEventListener("hass-api-called", (event) => {
  const detail = event.detail;
  if (detail.success && detail.path === "config/config_entries/entry_update") {
    refreshComponent();
  }
});

function refreshComponent() {
  const backgroundGraphEntities = document.querySelector("background-graph-entities");
  if (backgroundGraphEntities) {
    backgroundGraphEntities.setConfig(backgroundGraphEntities.config);
  }
}
```

## Conclusion

The `background-graph-entities` custom component is a powerful tool for visualizing sensor data in Home Assistant. Its flexibility in configuration and ease of use make it a great addition to any Home Assistant setup.

For further assistance or to report issues, please visit the [GitHub repository](https://github.com/timmaurice/background-graph-entities).