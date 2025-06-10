console.log(
  `%cbackground-graph-entities\n%cVersion: ${"0.0.6"}`,
  "color: #fff; background-color: #191970; font-weight: bold;",
  "",
);

class BackgroundGraphEntities extends HTMLElement {
  static get MINI_GRAPH_DEFAULT_SHOW_OPTIONS() {
    return {
      average: false,
      extrema: false,
      fill: false,
      icon: false,
      icon_adaptive_color: false,
      labels: false,
      labels_secondary: false,
      legend: false,
      name: false,
      name_adaptive_color: false,
      points: false,
      state: false,
    };
  }
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>
.card-content {
  padding: 16px;
}

.entity-row {
  align-items: center;
  cursor: pointer;
  display: flex;
  height: 40px;
  margin-bottom: 8px;
  position: relative;
}

.entity-row:last-of-type {
  margin-bottom: 0;
}

.entity-icon {
  fill: white;
  margin-right: 8px;
  text-align:center;
  width: 40px;
}

.entity-name {
  z-index: 1;
}

.entity-value {
  color: var(--primary-text-color);
  margin-left: auto;
  z-index: 1;
}

.mini-graph-container {
  --card-background-color: none;
  --ha-card-border-radius: 0;
  --ha-card-border-width: 0;
  position: absolute;
  bottom: 0;
  left: 45px;
  opacity: var(--line-opacity, 1);
  pointer-events: none;
  right: 0;
  top: 0;
}

.card-content.short .mini-graph-container {
  right: 70px;
}
                </style>
                <ha-card id="card-content" class="card-content"></ha-card>`;
    this._hass = null;
    this._entityElements = {}; // To cache entity-specific DOM elements
    this._miniGraphCards = []; // To cache mini-graph-card instances
  }

  setConfig(config) {
    if (!config.entities) {
      throw new Error("You need to define at least one entity");
    }

    this.config = config;
    this._createCard();
  }

  _createEntityRowElements(entityConfig) {
    const entityRow = document.createElement("div");
    entityRow.className = "entity-row";
    entityRow.dataset.entity = entityConfig.entity;
    entityRow.addEventListener("click", () =>
      this._openEntityPopup(entityConfig.entity),
    );

    // Use ha-state-icon to automatically get entity icons
    let entityIcon;
    if (entityConfig.icon) {
      entityIcon = document.createElement("ha-icon");
      entityIcon.className = "entity-icon";
      entityIcon.setAttribute("icon", entityConfig.icon);
    } else {
      entityIcon = document.createElement("ha-state-icon");
      entityIcon.className = "entity-icon";
    }

    if (entityConfig.line_opacity) {
      entityRow.style.setProperty("--line-opacity", entityConfig.line_opacity);
    }

    const graphContainer = document.createElement("div");
    graphContainer.className = "mini-graph-container";

    const entityName = document.createElement("div");
    entityName.className = "entity-name";
    entityName.textContent = entityConfig.name || entityConfig.entity;

    const entityValue = document.createElement("div");
    entityValue.className = "entity-value";
    entityValue.textContent = "Loading..."; // Initial state

    entityRow.append(entityIcon, entityName, graphContainer, entityValue);

    return { entityRow, entityIcon, graphContainer, entityValue };
  }

  async _createCard() {
    this._entityElements = {}; // Clear previously cached elements
    this._miniGraphCards = []; // Clear previously cached graph card instances
    const cardContent = this.shadowRoot.getElementById("card-content");

    cardContent.className = "card-content"; // Reset classes
    if (this.config.line_length === "short") {
      cardContent.classList.add("short");
    }
    cardContent.innerHTML = ""; // Clear previous content of the ha-card element
    const fragment = document.createDocumentFragment();

    for (const entityConfig of this.config.entities) {
      const elements = this._createEntityRowElements(entityConfig);
      this._entityElements[entityConfig.entity] = {
        valueElement: elements.entityValue,
        iconElement: elements.entityIcon,
        colorThresholds: entityConfig.color_thresholds || [], // Store color thresholds
      };
      fragment.appendChild(elements.entityRow);
      // Lazy load the graph for the entity after a delay
      setTimeout(
        () => this._createMiniGraphCard(elements.graphContainer, entityConfig),
        0,
      );
    }
    cardContent.appendChild(fragment);
  }

  async _createMiniGraphCard(container, entityConfig) {
    await customElements.whenDefined("mini-graph-card");

    const miniGraphCard = document.createElement("mini-graph-card");
    // Pass entityConfig to configure the mini-graph-card
    miniGraphCard.setConfig({
      entities: [{ entity: entityConfig.entity }], // Use entityConfig.entity
      group: true,
      // The following options are taken from the main card config
      height: 56,
      hour24: true,
      line_length: this.config.line_length || "long",
      hours_to_show: this.config.hoursToShow || 24,
      line_color: this.config.line_color || "rgba(255, 255, 255, 0.2)",
      line_width: this.config.line_width || 5,
      points_per_hour: this.config.points_per_hour || 1,
      update_interval: this.config.update_interval || 600,
      show: {
        ...BackgroundGraphEntities.MINI_GRAPH_DEFAULT_SHOW_OPTIONS,
        ...(this.config.mini_graph_show_options || {}),
      },
      color_thresholds: entityConfig.color_thresholds || [], // Pass color thresholds
    });

    container.appendChild(miniGraphCard);
    this._miniGraphCards.push(miniGraphCard); // Cache the graph card instance

    // Force a redraw of the card
    miniGraphCard.hass = this._hass;
  }

  _getState(entityId) {
    return this._hass ? this._hass.states[entityId] : null;
  }

  _openEntityPopup(entityId) {
    if (this._hass) {
      const event = new Event("hass-more-info", {
        bubbles: true,
        cancelable: false,
        composed: true,
      });
      event.detail = { entityId };
      this.dispatchEvent(event);
    }
  }

  set hass(hass) {
    this._hass = hass;
    const entities = this.config.entities || [];
    entities.forEach((entityConfig) => {
      const cachedElements = this._entityElements[entityConfig.entity];
      if (!cachedElements) return; // Should not happen if _createCard ran correctly

      const { iconElement, valueElement } = cachedElements;
      const stateObj = this._getState(entityConfig.entity);

      if (stateObj) {
        // Update entity value
        if (valueElement) {
          const state = parseInt(stateObj.state, 10);
          const unit = stateObj.attributes.unit_of_measurement || "";

          if (unit.toLowerCase() === "min" && state > 60) {
            const hours = Math.floor(state / 60);
            const minutes = state % 60;
            valueElement.textContent = `${hours}h ${minutes}min`;
          } else {
            valueElement.textContent = `${stateObj.state} ${unit}`;
          }
        }

        // Update entity icon
        if (iconElement) {
          // If iconElement is an <ha-state-icon>, it needs hass and stateObj
          // to determine the icon.
          // If iconElement is an <ha-icon> (because entityConfig.icon was set),
          // these properties are ignored but harmless.
          iconElement.hass = this._hass;
          iconElement.stateObj = stateObj;
        }
      } else {
        // Entity state not found
        if (valueElement) {
          valueElement.textContent = this._hass.localize
            ? this._hass.localize("state.default.unavailable") || "Unavailable"
            : "Unavailable";
        }
        if (iconElement) {
          iconElement.hass = this._hass;
          iconElement.stateObj = null; // Clear the state for the icon
        }
      }
    });

    // Update the hass object for the mini-graph-cards
    this._miniGraphCards.forEach((graphCard) => {
      graphCard.hass = hass;
    });
  }

  getCardSize() {
    return this.config.entities.length + 1;
  }
}

customElements.define("background-graph-entities", BackgroundGraphEntities);

window.addEventListener("hass-api-called", (event) => {
  const detail = event.detail;
  if (detail.success && detail.path === "config/config_entries/entry_update") {
    refreshComponent();
  }
});

// This function refreshes the component by re-calling setConfig.
function refreshComponent() {
  const backgroundGraphEntities = document.querySelector(
    "background-graph-entities",
  );
  if (backgroundGraphEntities) {
    backgroundGraphEntities.setConfig(backgroundGraphEntities.config);
  }
}
