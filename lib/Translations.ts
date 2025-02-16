import { DataSource } from "typeorm";
import { Translation } from "../model/Translation";

export default class Translations {
  public items: Translation[] = [];
  private appDataSource: DataSource;

  constructor(appDataSource: DataSource) {
    this.appDataSource = appDataSource;
  }

  /**
   *
   * @param languageCode Code of language (default is `en`) for which translations should be loaded
   */
  public async loadTranslations(languageCode: string = "en"): Promise<void> {
    const translationsRepository =
      this.appDataSource.getRepository(Translation);
    this.items = await translationsRepository.find({
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
   * @returns {{ translation: string, textCode: string }}
   */
  public getText(textCode: string): { translation: string; textCode: string } {
    const translation = this.items.find((e) => e.text.text == textCode);
    return {
      translation: translation ? translation.translation : textCode,
      textCode: textCode,
    };
  }
}
