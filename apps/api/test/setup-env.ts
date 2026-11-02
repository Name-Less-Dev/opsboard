// Valores fixos para a suíte não depender de um .env (ex.: no CI).
process.env.JWT_SECRET = 'segredo-de-teste';
process.env.JWT_EXPIRES_IN = '1h';
