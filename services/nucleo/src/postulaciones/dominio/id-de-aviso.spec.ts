import { describe, expect, it } from 'vitest';
import { idDeAviso } from './id-de-aviso';

describe('idDeAviso', () => {
  it('saca el número del aviso de cada portal', () => {
    expect(idDeAviso('https://www.chiletrabajos.cl/trabajo/ingeniero-de-software-backend-ia-3916453')).toBe(
      '3916453',
    );
    expect(idDeAviso('https://tenpo.teamtailor.com/jobs/8632917-ai-engineer')).toBe('8632917');
    expect(idDeAviso('https://www.linkedin.com/jobs/view/4012345678/?refId=123456789')).toBe('4012345678');
  });

  it('acepta el número solo o con #', () => {
    expect(idDeAviso('3916453')).toBe('3916453');
    expect(idDeAviso(' #3916453 ')).toBe('3916453');
  });

  it('sin número de 6 dígitos o con texto que no es URL, nada', () => {
    expect(idDeAviso('https://www.getonbrd.com/jobs/programming/backend-nestjs-kora')).toBeNull();
    expect(idDeAviso('12345')).toBeNull();
    expect(idDeAviso('no es una url')).toBeNull();
  });
});
