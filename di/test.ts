import { container } from "tsyringe";
import "reflect-metadata"; // обязательно один раз в приложении
import "./container"; // импортирует DI-регистрации
import StashService from "service/StashService"; // путь к твоему классу

const stashService = container.resolve(StashService);
