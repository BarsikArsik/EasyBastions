Hooks.once("init", () => {
  Handlebars.registerHelper("eq", (a, b) => a === b);
  Handlebars.registerHelper("add", (a, b) => Number(a) + Number(b));

  const mod = game.modules.get("easy-bastion");
  if (!mod) return;

  mod.api = {
    openBastionSheet: async () => {
      const SheetClass = globalThis.EasyBastionSheet;
      if (!SheetClass) {
        ui.notifications.error("Класс EasyBastionSheet не загружен.");
        return null;
      }

      const selectedJournalId = await SheetClass.chooseExistingBastion();

      if (selectedJournalId && selectedJournalId !== "cancel") {
        const journal = game.journal.get(selectedJournalId);
        const data = journal?.getFlag("easy-bastion", "bastionData") ?? {};
        return SheetClass.open(data);
      }

      return SheetClass.open();
    },

    openBastionFromJournal: async (journalId) => {
      const SheetClass = globalThis.EasyBastionSheet;
      if (!SheetClass) {
        ui.notifications.error("Класс EasyBastionSheet не загружен.");
        return null;
      }

      const journal = game.journal.get(journalId);
      if (!journal) {
        ui.notifications.warn("Журнал бастиона не найден.");
        return null;
      }

      const data = journal.getFlag("easy-bastion", "bastionData") ?? {};
      return SheetClass.open(data);
    },

    createEmptyBastion: async () => {
      const SheetClass = globalThis.EasyBastionSheet;
      if (!SheetClass) {
        ui.notifications.error("Класс EasyBastionSheet не загружен.");
        return null;
      }

      return SheetClass.open();
    }
  };

  Hooks.callAll("easyBastionReady", mod.api);
});

Hooks.once("ready", () => {
  console.log("[easy-bastion] Module ready");
});