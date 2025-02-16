// config.test.ts
import { expect } from "chai";
import Translations from "../../lib/Translations";

describe("User Routes", () => {
  describe("Translations", () => {
    it("should load empty translation for 'en' language and fallback to textCode", async () => {
      const translations = new Translations(globalThis.appDataSource);
      translations.loadTranslations();
      const result = translations.getText("error_500");
      expect(result.translation).to.equal("error_500");
    });
  });
});
