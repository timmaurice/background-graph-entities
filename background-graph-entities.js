console.log(
  `%cbackground-graph-entities\n%cVersion: ${"0.0.1"}`,
  "color: #191970; font-weight: bold;",
  ""
);

class BackgroundGraphEntities extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    // Get the URL of the current script
    const currentScript = document.currentScript || Array.from(document.getElementsByTagName('script')).pop();
    const scriptUrl = new URL(currentScript.src);

    // Construct the path to the CSS file
    const cssPath = new URL('background-graph-entities.css', scriptUrl);

    // Set the shadow DOM content with the dynamic CSS path
    this.shadowRoot.innerHTML = `
        <link rel="stylesheet" href="${cssPath}">
        <ha-card id="card-content" class="card-content"></ha-card>
      `;

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

    for (const entity of this.config.entities) {
      const entityRow = document.createElement("div");
      entityRow.className = "entity-row";
      entityRow.dataset.entity = entity.entity;
      entityRow.addEventListener("click", () =>
        this._openEntityPopup(entity.entity)
      );

      const entityIcon = document.createElement("ha-icon");
      entityIcon.className = "entity-icon";
      const iconValue = entity.icon || "mdi:alert";
      entityIcon.setAttribute("icon", iconValue);
      entityRow.appendChild(entityIcon);

      const entityName = document.createElement("div");
      entityName.className = "entity-name";
      entityName.textContent = entity.name || entity.entity;
      entityRow.appendChild(entityName);

      // Create a container for the mini graph card
      const graphContainer = document.createElement("div");
      graphContainer.className = "mini-graph-container";
      entityRow.appendChild(graphContainer);

      // Create and append the mini-graph-card
      await this._createMiniGraphCard(graphContainer, entity.entity);

      const entityValue = document.createElement("div");
      entityValue.className = "entity-value";
      entityValue.textContent = "Loading..."; // Initial state
      entityRow.appendChild(entityValue);

      cardContent.appendChild(entityRow);
    }
  }

  async _createMiniGraphCard(container, entity) {
    await customElements.whenDefined("mini-graph-card");

    const miniGraphCard = document.createElement("mini-graph-card");
    miniGraphCard.setConfig({
      entities: [{ entity: entity }],
      hours_to_show: this.config.hoursToShow || 24,
      group: true,
      points_per_hour: 1,
      line_color: "rgba(255, 255, 255, 0.8)",
      hour24: true,
      line_width: 5,
      height: 35,
      update_interval: 600,
      show: {
        name: false,
        icon: false,
        state: false,
        points: false,
        legend: false,
        average: false,
        extrema: false,
        labels: false,
        fill: false,
        labels_secondary: false,
        name_adaptive_color: false,
        icon_adaptive_color: false,
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
          entityValue.textContent = stateObj.state;
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
