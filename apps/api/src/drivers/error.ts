export class DriverError extends Error {
  where: 'code' | 'testCase';
  constructor(message: string, where: 'code' | 'testCase') {
    super(message);
    this.where = where;
  }
}
