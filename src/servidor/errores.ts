export class ErrorNegocio extends Error { estado = 409; }
export class ErrorValidacion extends Error { estado = 400; }
export class NoEncontrado extends Error { estado = 404; constructor(m = 'No existe') { super(m); } }
