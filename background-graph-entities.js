console.log(
  `%cbackground-graph-entities\n%cVersion: ${"0.0.3"}`,
  "color: #fff; background-color: #191970; font-weight: bold;",
  ""
);

class BackgroundGraphEntities extends HTMLElement {
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

.entity-value {
  color: var(--primary-text-color);
  margin-left: auto;
}

.mini-graph-container {
  --card-background-color: none;
  --ha-card-border-radius: 0;
  --ha-card-border-width: 0;
  position: absolute;
  top: 0;
  left: 45px;
  right: 0;
  bottom: 0;
  pointer-events: none;
}
                </style>
                <ha-card id="card-content" class="card-content"></ha-card>`;
    this._hass = null;
  }

  setConfig(config) {
    if (!config.entities) {
      throw new Error("You need to define at least one entity");
    }

    this.config = config;
    this._createCard();
  }

  async _createCard() {
    const cardContent = this.shadowRoot.getElementById("card-content");
    cardContent.innerHTML = ""; // Clear previous content
    const fragment = document.createDocumentFragment();

    for (const entity of this.config.entities) {
      const entityRow = document.createElement("div");
      entityRow.className = "entity-row";
      entityRow.dataset.entity = entity.entity;
      entityRow.addEventListener("click", () =>
        this._openEntityPopup(entity.entity)
      );

      const entityIcon = document.createElement("ha-icon");
      entityIcon.className = "entity-icon";
      entityIcon.setAttribute("icon", entity.icon || "mdi:alert");
      entityRow.appendChild(entityIcon);

      const entityName = document.createElement("div");
      entityName.className = "entity-name";
      entityName.textContent = entity.name || entity.entity;
      entityRow.appendChild(entityName);

      const graphContainer = document.createElement("div");
      graphContainer.className = "mini-graph-container";
      entityRow.appendChild(graphContainer);

      const entityValue = document.createElement("div");
      entityValue.className = "entity-value";
      entityValue.textContent = "Loading...";
      entityRow.appendChild(entityValue);

      fragment.appendChild(entityRow);

      // Lazy load the graph for the entity after a delay
      setTimeout(
        () => this._createMiniGraphCard(graphContainer, entity.entity),
        0
      );
    }
    cardContent.appendChild(fragment);
  }

  async _createMiniGraphCard(container, entity) {
    await customElements.whenDefined("mini-graph-card");

    const miniGraphCard = document.createElement("mini-graph-card");
    miniGraphCard.setConfig({
      entities: [{ entity: entity }],
      group: true,
      height: 56,
      hour24: true,
      hours_to_show: this.config.hoursToShow || 24,
      line_color: this.config.line_color || "rgba(255, 255, 255, 0.2)",
      line_width: this.config.line_width || 5,
      points_per_hour: this.config.points_per_hour || 1,
      update_interval: this.config.update_interval || 600,
      show: {
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
      },
    });

    container.appendChild(miniGraphCard);

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
    entities.forEach((entity) => {
      const stateObj = this._getState(entity.entity);
      if (stateObj) {
        const entityValue = this.shadowRoot.querySelector(
          `.entity-row[data-entity="${entity.entity}"] .entity-value`
        );
        if (entityValue) {
          const state = parseInt(stateObj.state, 10);
          const unit = stateObj.attributes.unit_of_measurement || "";

          if (unit.toLowerCase() === "min" && state > 60) {
            const hours = Math.floor(state / 60);
            const minutes = state % 60;
            entityValue.textContent = `${hours}h ${minutes}min`;
          } else {
            entityValue.textContent = `${stateObj.state} ${unit}`;
          }
        }
      }
    });

    // Update the hass object for the mini-graph-cards
    const miniGraphContainers = this.shadowRoot.querySelectorAll(
      ".mini-graph-container > mini-graph-card"
    );
    miniGraphContainers.forEach((card) => {
      card.hass = hass;
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

function refreshComponent() {
  const backgroundGraphEntities = document.querySelector(
    "background-graph-entities"
  );
  if (backgroundGraphEntities) {
    backgroundGraphEntities.setConfig(backgroundGraphEntities.config);
  }
}
