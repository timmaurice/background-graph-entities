# Background Graph Entities Custom Component

## Overview

The `background-graph-entities` custom component for Home Assistant displays a list of entities with their current state and a mini graph showing the entity's history. This component is ideal for monitoring various sensor data, such as temperature, humidity, or other metrics.

## Features

- Displays current state and mini graph for each entity
- Supports custom icons for each entity
- Click on an entity to open the detailed info popup
- Configurable graph settings for each entity

## Installation

1. **Download the Component:**
   - Download the `background-graph-entities.js` file and place it in the `/www/background_graph_entities/` directory of your Home Assistant configuration.

2. **Add Resource:**
   - Add the following to your `configuration.yaml` under `lovelace` resources section:
     ```yaml
     lovelace:
       resources:
         - url: /local/background_graph_entities/background-graph-entities.js
           type: module
     ```

3. **Add the CSS File:**
   - Download the `background-graph-entities.css` file and place it in the `/www/background_graph_entities/` directory.

4. **Restart Home Assistant:**
   - Restart Home Assistant to apply the changes.

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

For further assistance or to report issues, please visit the [GitHub repository](#).