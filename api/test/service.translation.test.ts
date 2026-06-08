import { expect } from "chai";
import sinon from "sinon";

import Translation from "#model/Translation.js";
import Text from "#model/Text.js";
import Language from "#model/Language.js";
import LogService from "#service/LogService.js";

import TranslationService from "#service/TranslationService.js";

let translationRepository = globalThis.appDataSource.getRepository(Translation);
const translationService = new TranslationService(translationRepository, null as any, null as any, null as any);
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

  describe("Seed logic", () => {
    afterEach(() => {
      sinon.restore();
    });

    it("should seed with silent=false when items already exist and log skipped entries", async() => {
      const translationRepo = globalThis.appDataSource.getRepository(Translation);
      const languageRepo = globalThis.appDataSource.getRepository(Language);
      const textRepo = globalThis.appDataSource.getRepository(Text);
      const loggerStub = sinon.createStubInstance(LogService);

      const service = new TranslationService(translationRepo, languageRepo, textRepo, loggerStub as any);
      await service.init(false);

      expect(loggerStub.info.called).to.be.true;
    });

    it("should seed with silent=false when creating new items and log creation", async() => {
      const savedLanguage = new Language();
      savedLanguage.language = "English";
      savedLanguage.code = "en";

      const savedText = new Text();

      const languageRepo = {
        findOneBy: sinon.stub().resolves(null),
        manager: { save: sinon.stub().resolves(savedLanguage) },
      };
      const textRepo = {
        findOneBy: sinon.stub().resolves(null),
        manager: { save: sinon.stub().resolves(savedText) },
      };
      const translationRepo = {
        findOneBy: sinon.stub().resolves(null),
        manager: { save: sinon.stub().resolves({}) },
        find: sinon.stub().resolves([]),
      };
      const loggerStub = sinon.createStubInstance(LogService);

      const service = new TranslationService(
        translationRepo as any,
        languageRepo as any,
        textRepo as any,
        loggerStub as any,
      );
      await service.init(false);

      expect(loggerStub.info.called).to.be.true;
      expect(languageRepo.manager.save.called).to.be.true;
      expect(textRepo.manager.save.called).to.be.true;
      expect(translationRepo.manager.save.called).to.be.true;
    });

    it("should catch and suppress error thrown during seed", async() => {
      const languageRepo = {
        findOneBy: sinon.stub().rejects(new Error("DB connection lost")),
      };
      const translationRepo = {
        find: sinon.stub().resolves([]),
      };
      const loggerStub = sinon.createStubInstance(LogService);
      const consoleErrorStub = sinon.stub(console, "error");

      const service = new TranslationService(
        translationRepo as any,
        languageRepo as any,
        null as any,
        loggerStub as any,
      );

      await service.init(false);

      expect(consoleErrorStub.calledOnce).to.be.true;
    });
  });
});
