function config() {
  const url = process.env.MYSQL_URL ? new URL(process.env.MYSQL_URL) : null;

  const host = url?.hostname || process.env.MYSQL_HOST;
  const database = url
    ? decodeURIComponent(url.pathname.slice(1))
    : process.env.MYSQL_DATABASE;

  if (!host || !database) {
    throw Error(
      'MySQL bağlantısı eksik: MYSQL_HOST ve MYSQL_DATABASE veya MYSQL_URL ayarlayın.'
    );
  }

  return {
    host,
    port: Number(url?.port || process.env.MYSQL_PORT || 3306),
    user: url
      ? decodeURIComponent(url.username)
      : process.env.MYSQL_USER,
    password: url
      ? decodeURIComponent(url.password)
      : process.env.MYSQL_PASSWORD,
    database,
    charset: 'utf8mb4_unicode_ci',
    dateStrings: true,
    decimalNumbers: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    connectTimeout: 10000,
    multipleStatements: false,
    ssl: undefined
  };
}

module.exports = { config };