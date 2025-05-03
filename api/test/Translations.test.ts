// config.test.ts
import { expect } from "chai";

import Translation from "model/Translation";
import Text from "model/Text";
import Language from "model/Language";

describe("Translations", () => {
  it("should load empty translation for 'en' language and fallback to textCode", async () => {
    const result = globalThis.translationService.getText("error_500");
    expect(result.translation).to.equal("error_500");
  });

  it("should get proper translation", async () => {
    //create fake one for test
    const translation = new Translation();
    translation.text = new Text();
    translation.text.text = "error_500";
    translation.translation = "translation_error_500";
    translation.language = new Language();
    translation.language.code = "en";

    globalThis.translationService.items.push(translation);

    const result = globalThis.translationService.getText("error_500");
    expect(result.translation).to.equal("translation_error_500");
  });

  it("should get proper translation with applying params", async () => {
    //create fake one for test
    const translation = new Translation();
    translation.text = new Text();
    translation.text.text = "param_777";
    translation.translation = "param %d value";
    translation.language = new Language();
    translation.language.code = "en";

    globalThis.translationService.items.push(translation);

    const result = globalThis.translationService.getText("param_777", [777]);
    expect(result.translation).to.equal("param 777 value");
  });
});
