import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { provideSpartanHlm } from '@brecha/ui/utils';
import { routes } from './app.routes';
import { erroresInterceptor, tokenInterceptor } from './nucleo/errores/interceptores';
import { CargadorDeIdioma, IDIOMAS, idiomaInicial } from './nucleo/idioma/idioma';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([tokenInterceptor, erroresInterceptor])),
    provideSpartanHlm(),
    provideTransloco({
      config: {
        availableLangs: [...IDIOMAS],
        defaultLang: idiomaInicial(),
        fallbackLang: 'es',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: { logMissingKey: true },
      },
      loader: CargadorDeIdioma,
    }),
  ],
};
