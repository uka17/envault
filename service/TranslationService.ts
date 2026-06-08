import { Repository } from "typeorm";
import * as util from "util";
import { injectable, inject } from "tsyringe";
import chalk from "chalk";

import Translation from "#model/Translation.js";
import Language from "#model/Language.js";
import Text from "#model/Text.js";
import { TOKENS } from "#di/tokens.js";
import LogService from "#service/LogService.js";
import texts from "api/scripts/data/texts.js";

@injectable()
export default class TranslationService {
  private items: Translation[] = [];

  /**
   * Creates instance of `TranslationService`
   * @param translationRepository Translation repository
   * @param languageRepository Language repository
   * @param textRepository Text repository
   * @param logger Logger service
   */
  constructor(
    @inject(TOKENS.TranslationRepository) private translationRepository: Repository<Translation>,
    @inject(TOKENS.LanguageRepository) private languageRepository: Repository<Language>,
    @inject(TOKENS.TextRepository) private textRepository: Repository<Text>,
    @inject(TOKENS.LogService) private logger: LogService,
  ) {}

  /**
   * Seeds missing languages, texts, and translations from the init config, then loads all translations.
   */
  public async init(silent: boolean = true): Promise<void> {
    await this.seed(silent);
    this.items = await this.translationRepository.find({
      relations: {
        language: true,
        text: true,
      },
    });
  }

  /**
   * Seeds missing languages, texts, and translations from the init config into the database
   * @param silent When `true`, suppresses per-item log output
   */
  private async seed(silent: boolean): Promise<void> {
    try {
      this.logger.info(chalk.yellow(`>>> Updating translations in database... (silent=${silent})`));

      //Languages
      for (const lang of texts) {
        //Check if language already exists and create if needed
        let language = await this.languageRepository.findOneBy({ code: lang.languageCode });
        if (!language) {
          if (!silent) {
            this.logger.info(`Language '${lang.language}' does not exists, creating...`);
          }
          language = new Language();
          language.language = lang.language;
          language.code = lang.languageCode;
          await this.languageRepository.manager.save(language);
          if (!silent) {
            this.logger.info(chalk.green(`Created '${language.language}' language`));
          }
        }

        //Add translations
        for (const [textCode, textTranslation] of Object.entries(lang.textTranslations)) {
          //Check if text already exists and create if needed
          let text = await this.textRepository.findOneBy({ text: textCode });
          if (!text) {
            if (!silent) {
              this.logger.info(`Text '${textCode}' does not exists, creating...`);
            }
            text = new Text();
            text.text = textCode;
            await this.textRepository.manager.save(text);
            if (!silent) {
              this.logger.info(chalk.green(`Created text '${textCode}'`));
            }
          }

          //Check if translation already exists and create if needed
          const translation = await this.translationRepository.findOneBy({
            text: { id: text.id },
            language: { id: language.id },
          });
          if (!translation) {
            const newTranslation = new Translation();
            newTranslation.text = text;
            newTranslation.language = language;
            newTranslation.translation = textTranslation as string;
            await this.translationRepository.manager.save(newTranslation);
            if (!silent) {
              this.logger.info(
                chalk.green(
                  `Created '${textTranslation}' transaltion for text '${text.text}', language '${language.language}'`,
                ),
              );
            }
          } else if (!silent) {
            this.logger.info(
              chalk.grey(
                `Skiped '${translation.translation}' transaltion for text '${text.text}' (already exists)`,
              ),
            );
          }
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Returns translation for the provided text code. Falls back to `textCode` itself if no translation is found.
   * @param textCode Code of the text entry
   * @param [params] Parameter or array of parameters to interpolate into the translation (optional)
   * @param [languageCode] Language code to look up (default is `en`)
   * @returns Object with `translation` (translated and interpolated string) and `textCode` (original code)
   * @throws Error if translations were not initialized or `params` is an empty array
   */
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
