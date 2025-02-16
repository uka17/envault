// config.test.ts
import { expect } from "chai";
import Translations from "../../lib/Translations";
import { Translation } from "../../model/Translation";
import { Text } from "../../model/Text";

describe("Translations", () => {
  it("should load empty translation for 'en' language and fallback to textCode", async () => {
    const translations = new Translations(globalThis.appDataSource);
    translations.loadTranslations();
    const result = translations.getText("error_500");
    expect(result.translation).to.equal("error_500");
  });

  it("should load empty translation for 'en' language and fallback to textCode", async () => {
    //load translations
    const translations = new Translations(globalThis.appDataSource);
    translations.loadTranslations();

    //create fake one for test
    const translation = new Translation();
    translation.text = new Text();
    translation.text.text = "error_500";
    translation.translation = "transaltion_error_500";

    translations.items.push(translation);

    const result = translations.getText("error_500");
    expect(result.translation).to.equal("transaltion_error_500");
  });
});
