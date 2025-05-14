import { Repository } from "typeorm";
import util from "util";
import { injectable, inject } from "tsyringe";

import Translation from "model/Translation";
import { TOKENS } from "di/tokens";
@injectable()
export default class TranslationService {
  private items: Translation[] = [];

  constructor(
    @inject(TOKENS.TranslationRepository) private translationRepository: Repository<Translation>,
  ) {}

  /**
   * Loads translations from the database
   */
  public async init(): Promise<void> {
    this.items = await this.translationRepository.find({
      relations: {
        language: true,
        text: true,
      },
    });
  }

  public getText(textCode: string): { translation: string; textCode: string };

  public getText(textCode: string, params:  (string | number)[] | null): { translation: string; textCode: string };

  public getText(textCode: string, params:  string | number | null): { translation: string; textCode: string };

  public getText(
    textCode: string,
    params: (string | number)[] | null,
    languageCode: string,
  ): { translation: string; textCode: string };

  public getText(
    textCode: string,
    params: string | number | null,
    languageCode: string,
  ): { translation: string; textCode: string };

  /**
   * Returns translation for provided text code, and undefined otherwise
   * @param textCode Code of text entry
   * @param [params] Array of parameters to be replaced in the translation (optional)
   * @param [languageCode] Code of language (default is `en`)
   * @returns {{ translation: string, textCode: string }}
   */
  public getText(
    textCode: string,
    params: (string | number)[] | string | number | null = null,
    languageCode: string = "en",
  ): { translation: string; textCode: string } {
    if (!this.items || this.items.length == 0) {
      throw new Error("Translations were not initialized");
    }
    const translation = this.items.find(
      (e) => e.text.text == textCode && e.language.code == languageCode,
    );
    //no translation - fallback to text code
    if (!translation) {
      return {
        translation: textCode,
        textCode: textCode,
      };
    } else {
      //we have params, replace them in the translation
      if (params) {
        let translationText: string;
        if(Array.isArray(params)) {
          if(params.length == 0) {
            throw new Error("Empty params array");
          }
          translationText = util.format(translation.translation, ...params);
        } else {
          translationText = util.format(translation.translation, params);  
        }
        let textCode = translation.text.text;
        return {
          translation: translationText,
          textCode,
        };
      } else {
        //no params, return translation
        return {
          translation: translation.translation,
          textCode: translation.text.text,
        };
      }
    }
  }
}
