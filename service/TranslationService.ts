import { DataSource, Repository } from "typeorm";
import util from "util";

import Translation from "../model/Translation";

export default class TranslationService {
  public items: Translation[] = [];
  private appDataSource: DataSource;
  private translationsRepository: Repository<Translation>;

  constructor(translationsRepository: Repository<Translation>) {
    this.translationsRepository = translationsRepository;
  }

  /**
   *
   * @param languageCode Code of language (default is `en`) for which translations should be loaded
   */
  public async loadTranslations(languageCode: string = "en"): Promise<void> {
    this.items = await this.translationsRepository.find({
      relations: {
        text: true,
      },
      where: {
        language: {
          code: languageCode,
        },
      },
    });
  }
  /**
   * Returns translation for provided text code, and undefined otherwise
   * @param textCode Code of text entry
   * @param [params] Array of parameters to be replaced in the translation (optional)
   * @returns {{ translation: string, textCode: string }}
   */
  public getText(
    textCode: string,
    params: string[] | number[] | null = null
  ): { translation: string; textCode: string } {
    const translation = this.items.find((e) => e.text.text == textCode);
    //no translation - fallback to text code
    if (!translation) {
      return {
        translation: textCode,
        textCode: textCode,
      };
    } else {
      //we have params, replace them in the translation
      if (params) {
        let translationText = util.format(translation.translation, ...params);
        let textCode = translation.text.text;
        return {
          translation: translationText,
          textCode,
        };
      }
      //no params, return translation
      else
        return {
          translation: translation.translation,
          textCode: translation.text.text,
        };
    }
  }
}
