import base from '@brecha/config/eslint';

export default [...base, { ignores: ['dist/**', 'empaquetado/**', 'recursos/**'] }];
