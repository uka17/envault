import { TextLanguage } from "../model/TextLanguage";
import appDataSource from "../model/dataSource";

export default class Translations {
  public textLanguages: TextLanguage[] = [];

  constructor() {}

  /**
   *
   * @param languageCode Code of language (default is `en`) for which translations should be loaded
   */
  public async loadTranslations(languageCode: string) {
    const translationsRepository = appDataSource.getRepository(TextLanguage);
    this.textLanguages = await translationsRepository.find({
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
   * @returns {string}
   */
  public getText(textCode: string): string {
    const translation = this.textLanguages.find((e) => e.text.text == textCode);
    return translation ? translation.translation : textCode;
  }
}
