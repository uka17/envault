// config.test.ts
import { expect } from "chai";

import Translation from "model/Translation";
import Text from "model/Text";
import Language from "model/Language";

import TranslationService from "service/TranslationService";

let translationRepository = globalThis.appDataSource.getRepository(Translation);
const translationService = new TranslationService(translationRepository);
//not doing init here, as we want to test empty translationService

describe("Translations", () => {
  it("should load empty translation for 'en' language and fallback to textCode", async() => {
    const result = translationService.getText("error_500");
    expect(result.translation).to.equal("error_500");
  });

  it("should get proper translation", async() => {
    //create fake one for test
    const translation = new Translation();
    translation.text = new Text();
    translation.text.text = "error_500";
    translation.translation = "translation_error_500";
    translation.language = new Language();
    translation.language.code = "en";

    translationService.items.push(translation);

    const result = translationService.getText("error_500");
    expect(result.translation).to.equal("translation_error_500");
  });

  it("should get proper translation with applying params", async() => {
    //create fake one for test
    const translation = new Translation();
    translation.text = new Text();
    translation.text.text = "param_777";
    translation.translation = "param %d value";
    translation.language = new Language();
    translation.language.code = "en";

    translationService.items.push(translation);

    const result = translationService.getText("param_777", [777]);
    expect(result.translation).to.equal("param 777 value");
  });
});
