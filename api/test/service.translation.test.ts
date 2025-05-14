import { expect } from "chai";

import Translation from "model/Translation";
import Text from "model/Text";
import Language from "model/Language";

import TranslationService from "service/TranslationService";

let translationRepository = globalThis.appDataSource.getRepository(Translation);
const translationService = new TranslationService(translationRepository);
//not doing init here, as we want to test empty translationService

describe("Translation service", () => {
  describe("Regular logic", () => {
    it("should load empty translation for 'en' language and fallback to textCode", async() => {
      //create fake one for test
      const translation = new Translation();
      translation.text = new Text();
      translation.text.text = "error_500";
      translation.translation = "translation_error_500";
      translation.language = new Language();
      translation.language.code = "br";

      (translationService as any).items.push(translation);
      
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

      (translationService as any).items.push(translation);

      const result = translationService.getText("error_500");
      expect(result.translation).to.equal("translation_error_500");
    });

    it("should get proper translation with applying array params", async() => {
      //create fake one for test
      const translation = new Translation();
      translation.text = new Text();
      translation.text.text = "param_array";
      translation.translation = "param %d value, param %s value";
      translation.language = new Language();
      translation.language.code = "en";

      (translationService as any).items.push(translation);

      const result = translationService.getText("param_array", [777, "big"]);
      expect(result.translation).to.equal("param 777 value, param big value");
    });

    it("should get proper translation with applying singe param", async() => {
      //create fake one for test
      const translation = new Translation();
      translation.text = new Text();
      translation.text.text = "param_single";
      translation.translation = "param %d value";
      translation.language = new Language();
      translation.language.code = "en";

      (translationService as any).items.push(translation);

      const result = translationService.getText("param_single", 777);
      expect(result.translation).to.equal("param 777 value");
    });
  });
  describe("Errors", () => {
    it("should throw error because of empty param array", async() => {
      //create fake one for test
      const translation = new Translation();
      translation.text = new Text();
      translation.text.text = "param_single";
      translation.translation = "param %d value";
      translation.language = new Language();
      translation.language.code = "en";

      (translationService as any).items.push(translation);

      expect(() => {
        translationService.getText("param_single", []);
      }).to.throw("Empty params array");
    });
    it("should throw error because of not initialized transaltions", async() => {
      //create fake one for test
      (translationService as any).items = [];
      expect(() => {
        translationService.getText("param_single", 777);
      }).to.throw("Translations were not initialized");
    });
  });
});
