const EASY_BASTION_MODULE_ID = "easy-bastion";
const EASY_BASTION_FLAG = "bastionData";
const EASY_BASTION_PAGE = "Данные Бастиона";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class EasyBastionSheet extends HandlebarsApplicationMixin(ApplicationV2) {
  static SPECIALS = [
    { key: "arsenal", name: "Арсенал", order: "Торговля" },
    { key: "library", name: "Библиотека", order: "Исследование" },
    { key: "barracks", name: "Казармы", order: "Вербовка" },
    { key: "forge", name: "Кузница", order: "Изготовление" },
    { key: "arcane-study", name: "Магический кабинет", order: "Изготовление" },
    { key: "workshop", name: "Мастерская", order: "Изготовление" },
    { key: "garden", name: "Сад", order: "Сбор" },
    { key: "sanctuary", name: "Святилище", order: "Изготовление" },
    { key: "storehouse", name: "Хранилище", order: "Торговля" }
  ];

  static NO_ORDER = "Нет приказа";

  static LEVELS = {
    1: { slots: 2, text: "На 1 уровне доступны 2 особых сооружения." },
    2: { slots: 4, text: "На 2 уровне доступны 4 особых сооружения." },
    3: { slots: 5, text: "На 3 уровне доступны 5 особых сооружений." },
    4: { slots: 6, text: "На 4 уровне доступны 6 особых сооружений." }
  };

  static DEFAULT_OPTIONS = {
    id: "easy-bastion-sheet",
    classes: ["easy-bastion-window"],
    tag: "div",
    position: {
      width: 1400,
      height: "auto"
    },
    window: {
      title: "Планировщик Бастиона",
      resizable: true,
      contentClasses: ["standard-form"]
    }
  };

  static PARTS = {
    main: {
      template: `modules/${EASY_BASTION_MODULE_ID}/templates/bastion-sheet.hbs`
    }
  };

  static hasForgeInBastion(owners = []) {
    return owners.some((owner) =>
      Array.isArray(owner.buildings) &&
      owner.buildings.some((entry) => entry.building === "Кузница")
    );
  }

  static calculateArsenalCost(armCount, hasForge) {
    const amount = Math.max(1, Math.min(99, Number(armCount ?? 1) || 1));
    const baseCost = amount * 100;
    return {
      armCount: amount,
      baseCost,
      finalCost: hasForge ? Math.floor(baseCost / 2) : baseCost,
      hasForge
    };
  }

  static normalizeBuildingExtra(buildingName, extra = {}) {
    if (buildingName === "Казармы") {
      const defenders = Math.max(0, Math.min(12, Number(extra.defenders ?? 0) || 0));
      return { defenders };
    }

    if (buildingName === "Арсенал") {
      const armCount = Math.max(1, Math.min(99, Number(extra.armCount ?? 1) || 1));
      return { armCount };
    }

    if (buildingName === "Магический кабинет") {
      const itemType = ["Магическая фокусировка", "Книга", "Магический предмет"].includes(extra.itemType)
        ? extra.itemType
        : "Магическая фокусировка";
      return { itemType };
    }

    if (buildingName === "Сад") {
      const gardenType = ["Декоративный", "Лекарственный", "Пищевой", "Ядовитый"].includes(extra.gardenType)
        ? extra.gardenType
        : "Декоративный";
      return { gardenType };
    }
	
	if (buildingName === "Мастерская") {
	  const allowedTools = [
		"Инструменты гончара",
		"Инструменты каменщика",
		"Инструменты кожевника",
		"Инструменты плотника",
		"Инструменты резчика по дереву",
		"Инструменты ремонтника",
		"Инструменты сапожника",
		"Инструменты стеклодува",
		"Инструменты ткача",
		"Инструменты художника",
		"Инструменты ювелира"
	  ];

	  const workshopTools = Array.isArray(extra.workshopTools)
		? extra.workshopTools.filter(tool => allowedTools.includes(tool)).slice(0, 6)
		: [];

	  return { workshopTools };
	}

    return {};
  }

  static emptyBuilding() {
    return {
      building: "",
      order: this.NO_ORDER,
      extra: {}
    };
  }

  static emptyOwner(level = 1) {
    const slots = this.LEVELS[level]?.slots ?? 2;
    return {
      owner: "",
      maintenance: false,
      buildings: Array.from({ length: slots }, () => this.emptyBuilding())
    };
  }

  static orderLabel(buildingName) {
    const building = this.SPECIALS.find((entry) => entry.name === buildingName);
    return building ? building.order : this.NO_ORDER;
  }

  static orderChoices(buildingName) {
    const baseOrder = this.orderLabel(buildingName);
    return [
      { value: this.NO_ORDER, label: this.NO_ORDER },
      ...(buildingName && baseOrder !== this.NO_ORDER
        ? [{ value: baseOrder, label: baseOrder }]
        : [])
    ];
  }

  constructor(options = {}) {
    super(options);

    const source = options.initialData ?? {};
    const level = Number(source.level ?? 1);

    this.bastionState = {
      bastionName: source.bastionName ?? "",
      level,
      owners: Array.isArray(source.owners) && source.owners.length
        ? foundry.utils.deepClone(source.owners).map((owner) => {
            const maintenance = Boolean(owner.maintenance);
            const rawBuildings = Array.isArray(owner.buildings)
              ? owner.buildings
              : [
                  {
                    building: owner.building1 ?? "",
                    order: owner.order1 ?? this.constructor.NO_ORDER,
                    extra: {}
                  },
                  {
                    building: owner.building2 ?? "",
                    order: owner.order2 ?? this.constructor.NO_ORDER,
                    extra: {}
                  }
                ];

            const buildings = rawBuildings.map((entry) => {
              const building = entry.building ?? "";
              const order = maintenance
                ? this.constructor.NO_ORDER
                : (entry.order ?? this.constructor.orderLabel(building) ?? this.constructor.NO_ORDER);

              return {
                building,
                order: building ? order : this.constructor.NO_ORDER,
                extra: this.constructor.normalizeBuildingExtra(building, entry.extra ?? {})
              };
            });

            return {
              owner: owner.owner ?? "",
              maintenance,
              buildings
            };
          })
        : [this.constructor.emptyOwner(level)]
    };

    this.normalizeOwnersToLevel(level);
  }

  normalizeOwnersToLevel(level) {
    const slots = this.constructor.LEVELS[level]?.slots ?? 2;

    for (const owner of this.bastionState.owners) {
      owner.maintenance = Boolean(owner.maintenance);

      if (!Array.isArray(owner.buildings)) owner.buildings = [];

      while (owner.buildings.length < slots) {
        owner.buildings.push(this.constructor.emptyBuilding());
      }

      if (owner.buildings.length > slots) {
        owner.buildings = owner.buildings.slice(0, slots);
      }

      owner.buildings = owner.buildings.map((entry) => {
        const building = entry.building ?? "";
        const allowedOrders = this.constructor.orderChoices(building).map((o) => o.value);

        return {
          building,
          order: owner.maintenance
            ? this.constructor.NO_ORDER
            : (allowedOrders.includes(entry.order) ? entry.order : this.constructor.NO_ORDER),
          extra: this.constructor.normalizeBuildingExtra(building, entry.extra ?? {})
        };
      });
    }
  }

  static async chooseExistingBastion() {
    const journals = game.journal.contents
      .filter((j) => !!j.getFlag(EASY_BASTION_MODULE_ID, EASY_BASTION_FLAG))
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

    if (!journals.length) return null;

    const options = journals
      .map((j) => `<option value="${j.id}">${foundry.utils.escapeHTML(j.name)}</option>`)
      .join("");

    return foundry.applications.api.DialogV2.wait({
      window: { title: "Загрузить бастион" },
      content: `
        <form>
          <p>Выбери сохраненный журнал бастиона.</p>
          <label>
            <span>Бастион</span>
            <select name="journal-id">${options}</select>
          </label>
        </form>
      `,
      buttons: [
        {
          action: "load",
          label: "Загрузить",
          default: true,
          callback: (event, button) => button.form.elements["journal-id"].value
        },
        {
          action: "cancel",
          label: "Новый"
        }
      ]
    });
  }

  static async open(initialData = {}) {
    const app = new EasyBastionSheet({ initialData });
    await app.render({ force: true });
    return app;
  }

  static async getOrCreateJournal(bastionName) {
    let journal = game.journal.getName(bastionName);
    if (!journal) {
      journal = await JournalEntry.create({
        name: bastionName,
        pages: [{
          name: EASY_BASTION_PAGE,
          type: "text",
          text: { content: `<h1>${foundry.utils.escapeHTML(bastionName)}</h1><p>Журнал бастиона создан.</p>` }
        }]
      });
    }
    return journal;
  }

  static async saveToJournal(data) {
    const journal = await this.getOrCreateJournal(data.bastionName);
    await journal.setFlag(EASY_BASTION_MODULE_ID, EASY_BASTION_FLAG, data);

    const html = `
      <h1>${foundry.utils.escapeHTML(data.bastionName)}</h1>
      <p><strong>Уровень:</strong> ${data.level}</p>
      <p><strong>Владельцев:</strong> ${data.owners.length}</p>
      ${data.owners.map((owner, index) => `
        <h2>Владелец ${index + 1}: ${foundry.utils.escapeHTML(owner.owner)}</h2>
        <p><strong>Поддержание:</strong> ${owner.maintenance ? "Да" : "Нет"}</p>
        <ul>
          ${owner.buildings.map((entry, buildingIndex) => `
            <li>
              Сооружение ${buildingIndex + 1}: ${foundry.utils.escapeHTML(entry.building || "—")}
              — ${foundry.utils.escapeHTML(entry.order || this.NO_ORDER)}
              ${entry.building === "Казармы" ? ` — Защитники: ${Number(entry.extra?.defenders ?? 0)}` : ""}
              ${entry.building === "Арсенал"
                ? ` — Снарядить защитников: ${Number(entry.extra?.armCount ?? 1)}; Стоимость: ${
                    this.calculateArsenalCost(entry.extra?.armCount ?? 1, this.hasForgeInBastion(data.owners)).finalCost
                  } ЗМ`
                : ""}
              ${entry.building === "Магический кабинет"
                ? ` — Результат приказа: ${foundry.utils.escapeHTML(entry.extra?.itemType ?? "Магическая фокусировка")}`
                : ""}
              ${entry.building === "Сад"
                ? ` — Тип сада: ${foundry.utils.escapeHTML(entry.extra?.gardenType ?? "Декоративный")}`
                : ""}
			  ${entry.building === "Мастерская"
				? ` — Инструменты: ${foundry.utils.escapeHTML((entry.extra?.workshopTools ?? []).join(", ") || "не выбраны")}`
				: ""}
            </li>
          `).join("")}
        </ul>
      `).join("")}
    `;

    let page = journal.pages.find((p) => p.name === EASY_BASTION_PAGE);
    if (page) {
      await page.update({ "text.content": html });
    } else {
      await journal.createEmbeddedDocuments("JournalEntryPage", [{
        name: EASY_BASTION_PAGE,
        type: "text",
        text: { content: html }
      }]);
    }

    return journal;
  }

  async _prepareContext() {
    const hasForgeInBastion = this.constructor.hasForgeInBastion(this.bastionState.owners);
    const levelInfo = this.constructor.LEVELS[this.bastionState.level] ?? this.constructor.LEVELS[1];

    return {
      bastionName: this.bastionState.bastionName,
      level: this.bastionState.level,
      levelInfo,
      ownersCount: this.bastionState.owners.length,
      specials: this.constructor.SPECIALS,
      noOrder: this.constructor.NO_ORDER,
      owners: this.bastionState.owners.map((owner, ownerIndex) => ({
        index: ownerIndex,
        owner: owner.owner ?? "",
        maintenance: owner.maintenance,
        buildings: owner.buildings.map((entry, buildingIndex) => {
          const arsenalCost = entry.building === "Арсенал"
            ? this.constructor.calculateArsenalCost(entry.extra?.armCount ?? 1, hasForgeInBastion)
            : null;

          const currentOrder = owner.maintenance
            ? this.constructor.NO_ORDER
            : (entry.order ?? this.constructor.NO_ORDER);

			return {
			  index: buildingIndex,
			  building: entry.building ?? "",
			  order: currentOrder,
			  orderChoices: this.constructor.orderChoices(entry.building),
			  orderDisabled: owner.maintenance || !entry.building,
			  isBarracks: entry.building === "Казармы",
			  isArsenal: entry.building === "Арсенал",
			  isArcaneStudy: entry.building === "Магический кабинет",
			  isGarden: entry.building === "Сад",
			  isWorkshop: entry.building === "Мастерская",
			  showArcaneStudyExtra:
				entry.building === "Магический кабинет" &&
				!owner.maintenance &&
				currentOrder !== this.constructor.NO_ORDER,
			  extra: {
				defenders: entry.extra?.defenders ?? 0,
				armCount: entry.extra?.armCount ?? 1,
				itemType: entry.extra?.itemType ?? "Магическая фокусировка",
				gardenType: entry.extra?.gardenType ?? "Декоративный",
				workshopTools: Array.isArray(entry.extra?.workshopTools) ? entry.extra.workshopTools : []
			  },
			  workshopToolChoices: [
				"Инструменты гончара",
				"Инструменты каменщика",
				"Инструменты кожевника",
				"Инструменты плотника",
				"Инструменты резчика по дереву",
				"Инструменты ремонтника",
				"Инструменты сапожника",
				"Инструменты стеклодува",
				"Инструменты ткача",
				"Инструменты художника",
				"Инструменты ювелира"
			  ].map(tool => ({
				label: tool,
				value: tool,
				checked: Array.isArray(entry.extra?.workshopTools) && entry.extra.workshopTools.includes(tool)
			  })),
			  arsenalCost
			};
        })
      }))
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (!root) return;

    root.querySelector(".bastion-add-owner")?.addEventListener("click", () => {
      this.bastionState.owners.push(this.constructor.emptyOwner(this.bastionState.level));
      this.render({ force: true });
    });

    root.querySelectorAll(".bastion-remove-owner").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.ownerIndex);
        if (this.bastionState.owners.length === 1) {
          ui.notifications.warn("Нужен хотя бы один владелец.");
          return;
        }
        this.bastionState.owners.splice(index, 1);
        this.render({ force: true });
      });
    });

    root.querySelector('[name="bastion-name"]')?.addEventListener("input", (event) => {
      this.bastionState.bastionName = event.currentTarget.value;
    });

    root.querySelector('[name="bastion-level"]')?.addEventListener("change", (event) => {
      this.bastionState.level = Number(event.currentTarget.value || 1);
      this.normalizeOwnersToLevel(this.bastionState.level);
      this.render({ force: true });
    });

    root.querySelectorAll(".owner-name-input").forEach((input) => {
      input.addEventListener("input", (event) => {
        const index = Number(event.currentTarget.dataset.ownerIndex);
        this.bastionState.owners[index].owner = event.currentTarget.value;
      });
    });

    root.querySelectorAll(".owner-maintenance-input").forEach((input) => {
      input.addEventListener("change", (event) => {
        const ownerIndex = Number(event.currentTarget.dataset.ownerIndex);
        const checked = event.currentTarget.checked;
        const owner = this.bastionState.owners[ownerIndex];

        owner.maintenance = checked;
        owner.buildings = owner.buildings.map((entry) => ({
          building: entry.building ?? "",
          order: this.constructor.NO_ORDER,
          extra: this.constructor.normalizeBuildingExtra(entry.building ?? "", entry.extra ?? {})
        }));

        this.render({ force: true });
      });
    });

    root.querySelectorAll('select[data-owner-index][data-building-index]:not([data-extra-field])').forEach((select) => {
      select.addEventListener("change", (event) => {
        const ownerIndex = Number(event.currentTarget.dataset.ownerIndex);
        const buildingIndex = Number(event.currentTarget.dataset.buildingIndex);
        const value = event.currentTarget.value;
        const owner = this.bastionState.owners[ownerIndex];
        const building = owner.buildings[buildingIndex];

        building.building = value;
        building.order = this.constructor.NO_ORDER;
        building.extra = this.constructor.normalizeBuildingExtra(value, {});
        this.render({ force: true });
      });
    });

    root.querySelectorAll("select[data-owner-index][data-order-index]").forEach((select) => {
      select.addEventListener("change", (event) => {
        const ownerIndex = Number(event.currentTarget.dataset.ownerIndex);
        const orderIndex = Number(event.currentTarget.dataset.orderIndex);
        const value = event.currentTarget.value;
        const owner = this.bastionState.owners[ownerIndex];

        if (owner.maintenance) return;

        owner.buildings[orderIndex].order = value;
        owner.buildings[orderIndex].extra = this.constructor.normalizeBuildingExtra(
          owner.buildings[orderIndex].building,
          owner.buildings[orderIndex].extra ?? {}
        );

        this.render({ force: true });
      });
    });

    root.querySelectorAll("input[data-owner-index][data-building-index][data-extra-field]").forEach((input) => {
      input.addEventListener("input", (event) => {
        const ownerIndex = Number(event.currentTarget.dataset.ownerIndex);
        const buildingIndex = Number(event.currentTarget.dataset.buildingIndex);
        const field = event.currentTarget.dataset.extraField;
        const owner = this.bastionState.owners[ownerIndex];
        const building = owner.buildings[buildingIndex];

        if (!building.extra) building.extra = {};

        if (field === "defenders") {
          let value = Number(event.currentTarget.value);
          if (Number.isNaN(value)) value = 0;
          value = Math.max(0, Math.min(12, value));
          building.extra.defenders = value;
          event.currentTarget.value = value;
        }

        if (field === "armCount") {
          let value = Number(event.currentTarget.value);
          if (Number.isNaN(value)) value = 1;
          value = Math.max(1, Math.min(99, value));
          building.extra.armCount = value;
          event.currentTarget.value = value;
        }

        this.render({ force: true });
      });
    });

    root.querySelectorAll("select[data-owner-index][data-building-index][data-extra-field]").forEach((select) => {
      select.addEventListener("change", (event) => {
        const ownerIndex = Number(event.currentTarget.dataset.ownerIndex);
        const buildingIndex = Number(event.currentTarget.dataset.buildingIndex);
        const field = event.currentTarget.dataset.extraField;
        const value = event.currentTarget.value;
        const owner = this.bastionState.owners[ownerIndex];
        const building = owner.buildings[buildingIndex];

        if (!building.extra) building.extra = {};

        if (field === "itemType") {
          building.extra.itemType = value;
        }

        if (field === "gardenType") {
          building.extra.gardenType = value;
        }

		if (field === "workshopType") {
		  building.extra.workshopType = value;
		}
		
        this.render({ force: true });
      });
    });

    root.querySelector(".bastion-save")?.addEventListener("click", async () => {
      const result = {
        bastionName: this.bastionState.bastionName?.trim() || "Безымянный бастион",
        level: this.bastionState.level,
        owners: this.bastionState.owners.map((owner, index) => ({
          owner: owner.owner?.trim() || `Владелец ${index + 1}`,
          maintenance: Boolean(owner.maintenance),
          buildings: owner.buildings.map((entry) => ({
            building: entry.building || "",
            order: owner.maintenance ? this.constructor.NO_ORDER : (entry.order || this.constructor.NO_ORDER),
            extra: this.constructor.normalizeBuildingExtra(entry.building || "", entry.extra ?? {})
          }))
        }))
      };

      const journal = await this.constructor.saveToJournal(result);
      ui.notifications.info(`Бастион "${result.bastionName}" сохранен.`);
      await journal.sheet.render(true);
    });

    root.querySelector(".bastion-open-journal")?.addEventListener("click", async () => {
      const bastionName = this.bastionState.bastionName?.trim();
      if (!bastionName) {
        return ui.notifications.warn("Сначала укажи название бастиона.");
      }

      const journal = game.journal.getName(bastionName);
      if (!journal) {
        return ui.notifications.warn("Журнал еще не создан.");
      }

      await journal.sheet.render(true);
    });
	
	html.querySelectorAll('.workshop-tool-input').forEach((input) => {
	  input.addEventListener('change', async (event) => {
		const target = event.currentTarget;
		const ownerIndex = Number(target.dataset.ownerIndex);
		const buildingIndex = Number(target.dataset.buildingIndex);

		const owner = this.bastionData.owners[ownerIndex];
		const building = owner?.buildings?.[buildingIndex];
		if (!building) return;

		const inputs = html.querySelectorAll(
		  `.workshop-tool-input[data-owner-index="${ownerIndex}"][data-building-index="${buildingIndex}"]`
		);

		const selected = Array.from(inputs)
		  .filter((el) => el.checked)
		  .map((el) => el.value);

		if (selected.length > 6) {
		  target.checked = false;
		  ui.notifications?.warn("Для Мастерской можно выбрать не более 6 инструментов.");
		  return;
		}

		building.extra.workshopTools = selected;
		await this.render({ force: true });
	  });
	});
  }
}

globalThis.EasyBastionSheet = EasyBastionSheet;