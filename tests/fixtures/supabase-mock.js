(() => {
  const mesas = [
    { id: 'mesa-1', nombre: 'Mesa de prueba', zona: 'salon', capacidad: 4, activa: true },
  ];
  const platos = [
    { id: 'plato-1', nombre: 'Pizza de prueba', categoria: 'pizzas', precio: 20000, disponible: true },
    { id: 'plato-2', nombre: 'Limonada de prueba', categoria: 'bebidas', precio: 5000, disponible: true },
  ];
  const dias = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  const horarios = dias.flatMap((dia, index) => [
    {
      id: `horario-${index}-almuerzo`, dia_semana: dia, jornada: 'almuerzo',
      hora_inicio: '12:30:00', hora_fin: '14:30:00', duracion_slot: 60, activo: true,
    },
    {
      id: `horario-${index}-noche`, dia_semana: dia, jornada: 'noche',
      hora_inicio: '17:00:00', hora_fin: '19:00:00', duracion_slot: 60, activo: true,
    },
  ]);
  const tables = {
    admin_roles: [{ user_id: 'test-admin', security_level: 'administrador' }],
    mesas,
    platos,
    horarios,
    reservas: [{
      id: 'reserva-1',
      mesa_id: 'mesa-1',
      cliente_nombre: 'Reserva de prueba',
      cliente_contacto: '',
      num_personas: 2,
      fecha: '2030-01-01',
      hora_inicio: '12:30:00',
      hora_fin: '13:30:00',
      estado: 'confirmada',
    }],
    reservas_ocupadas: [],
  };
  window.__testDbWrites = [];
  window.__setTestRole = (securityLevel) => {
    tables.admin_roles[0].security_level = securityLevel;
  };

  class Query {
    constructor(table) {
      this.table = table;
      this.action = 'select';
      this.filters = [];
    }

    select() { return this; }
    maybeSingle() {
      const result = this.execute();
      return Promise.resolve({ ...result, data: result.data[0] || null });
    }
    order() { return this; }
    range() { return this; }
    eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
    in(key, values) { this.filters.push((row) => values.includes(row[key])); return this; }
    insert(value) { this.action = 'insert'; this.value = value; return this; }
    update(value) { this.action = 'update'; this.value = value; return this; }
    delete() { this.action = 'delete'; return this; }

    then(resolve, reject) {
      return Promise.resolve(this.execute()).then(resolve, reject);
    }

    execute() {
      const rows = tables[this.table] || [];
      const matches = (row) => this.filters.every((filter) => filter(row));
      if (this.action === 'insert') {
        const values = Array.isArray(this.value) ? this.value : [this.value];
        window.__testDbWrites.push({
          table: this.table,
          action: this.action,
          values: values.map((row) => ({ ...row })),
        });
        rows.push(...values.map((row, index) => ({ id: `${this.table}-new-${index}`, ...row })));
        return { data: null, error: null };
      }
      if (this.action === 'update') {
        window.__testDbWrites.push({ table: this.table, action: this.action });
        rows.filter(matches).forEach((row) => Object.assign(row, this.value));
        return { data: null, error: null };
      }
      if (this.action === 'delete') {
        window.__testDbWrites.push({ table: this.table, action: this.action });
        tables[this.table] = rows.filter((row) => !matches(row));
        return { data: null, error: null };
      }
      const filtered = rows.filter(matches);
      return { data: filtered.map((row) => ({ ...row })), error: null, count: filtered.length };
    }
  }

  let currentSession = null;
  const authListeners = new Set();
  const auth = {
    async getSession() {
      return { data: { session: currentSession }, error: null };
    },
    async getUser() {
      return { data: { user: currentSession?.user || null }, error: null };
    },
    async signInWithPassword({ email, password }) {
      if (email !== 'admin@test.invalid' || password !== 'test-admin-password') {
        return { data: { user: null, session: null }, error: { message: 'invalid login credentials' } };
      }
      currentSession = { user: { id: 'test-admin', email } };
      authListeners.forEach((listener) => listener('SIGNED_IN', currentSession));
      return { data: { user: currentSession.user, session: currentSession }, error: null };
    },
    async signOut() {
      currentSession = null;
      authListeners.forEach((listener) => listener('SIGNED_OUT', null));
      return { error: null };
    },
    onAuthStateChange(listener) {
      authListeners.add(listener);
      return { data: { subscription: { unsubscribe: () => authListeners.delete(listener) } } };
    },
  };

  window.supabase = {
    createClient: () => ({ from: (table) => new Query(table), auth }),
  };
})();
