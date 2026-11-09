const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { after, before, describe, it } = require('node:test');
const { Builder, By, until } = require('selenium-webdriver');
const edge = require('selenium-webdriver/edge');

const root = path.resolve(__dirname, '..');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};
const testConfig = `window.APP_CONFIG = {
  SUPABASE_URL: 'https://test.invalid',
  SUPABASE_ANON_KEY: 'test-only-key',
  WHATSAPP: '573000000000',
  TELEFONO: '300 000 0000'
};`;

let server;
let driver;
let baseUrl;

function createServer() {
  return http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }

    if (pathname === '/js/config.js') {
      response.writeHead(200, { 'Content-Type': contentTypes['.js'] });
      response.end(testConfig);
      return;
    }

    if (pathname === '/test/supabase-mock.js') {
      fs.readFile(path.join(root, 'tests', 'fixtures', 'supabase-mock.js'), (error, content) => {
        if (error) {
          response.writeHead(500).end();
          return;
        }
        response.writeHead(200, { 'Content-Type': contentTypes['.js'] });
        response.end(content);
      });
      return;
    }

    const filePath = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
        return;
      }

      const body = ['index.html', 'admin.html'].includes(path.basename(filePath))
        ? content.toString().replace(
          /https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/,
          '/test/supabase-mock.js',
        )
        : content;
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      });
      response.end(body);
    });
  });
}

describe('Pruebas funcionales con Selenium', () => {
  before(async () => {
    server = createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const options = new edge.Options().addArguments('--headless=new');
    driver = await new Builder()
      .forBrowser('MicrosoftEdge')
      .setEdgeOptions(options)
      .build();
    await driver.manage().setTimeouts({ pageLoad: 20000, script: 10000 });
  });

  after(async () => {
    if (driver) await driver.quit();
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('muestra la página, mesas de prueba y categorías de la carta', async () => {
    await driver.manage().window().setRect({ width: 1280, height: 900 });
    await driver.get(baseUrl);
    await driver.executeScript('document.documentElement.style.scrollBehavior = "auto"');
    await driver.wait(until.elementLocated(By.css('.mesa-card')), 10000);

    assert.equal(await driver.findElement(By.css('.hero h1')).getText(), 'Konys Pizza');
    for (const section of ['#mesas', '#carta', '#reservar', '#contacto']) {
      assert.equal(await driver.findElement(By.css(section)).isDisplayed(), true);
    }
    assert.equal(await driver.findElement(By.css('.mesa-card h3')).getText(), 'Mesa de prueba');
    assert.equal(await driver.findElement(By.css('#carta-tabs [role="tab"]')).getText(), 'Pizzas');
    const drinksTab = driver.findElement(By.css('#carta-tabs [data-cat="bebidas"]'));
    await driver.executeScript(
      'arguments[0].scrollIntoView({ block: "center", behavior: "instant" })',
      drinksTab,
    );
    await drinksTab.click();
    assert.equal(await driver.findElement(By.css('#carta-lista h3')).getText(), 'Limonada de prueba');
  });

  it('abre el menú móvil y lo cierra al navegar', async () => {
    await driver.manage().window().setRect({ width: 390, height: 844 });
    await driver.get(baseUrl);

    const menuButton = driver.findElement(By.id('menu-btn'));
    const nav = driver.findElement(By.id('nav'));
    await driver.wait(until.elementIsVisible(menuButton), 10000);
    await menuButton.click();
    assert.equal(await menuButton.getAttribute('aria-expanded'), 'true');
    assert.equal((await nav.getAttribute('class')).includes('abierto'), true);

    await nav.findElement(By.css('a[href="#carta"]')).click();
    assert.equal(await driver.getCurrentUrl(), `${baseUrl}/#carta`);
    assert.equal(await menuButton.getAttribute('aria-expanded'), 'false');
  });

  it('valida campos de reserva y completa una reserva con datos ficticios', async () => {
    await driver.manage().window().setRect({ width: 1280, height: 900 });
    await driver.get(baseUrl);
    await driver.wait(until.elementLocated(By.css('[data-ver="mesa-1"]')), 10000);
    await driver.executeScript('document.documentElement.style.scrollBehavior = "auto"');
    const reserveButton = driver.findElement(By.css('[data-ver="mesa-1"]'));
    await driver.executeScript(
      'arguments[0].scrollIntoView({ block: "center", behavior: "instant" })',
      reserveButton,
    );
    await reserveButton.click();

    const futureDate = driver.findElement(By.css('#dias .dia:not([disabled])[data-fecha]:not(:first-child)'));
    await driver.wait(until.elementIsVisible(futureDate), 10000);
    await futureDate.click();
    const firstSlot = driver.findElement(By.css('#slots .slot:not([disabled])'));
    await driver.wait(until.elementIsVisible(firstSlot), 10000);
    await firstSlot.click();

    const name = driver.findElement(By.id('f-nombre'));
    const people = driver.findElement(By.id('f-personas'));
    const contact = driver.findElement(By.id('f-contacto'));
    assert.equal(await name.getAttribute('maxlength'), '80');
    assert.equal(await name.getAttribute('required'), 'true');
    assert.equal(await contact.getAttribute('inputmode'), 'numeric');
    assert.equal(await people.getAttribute('min'), '1');
    assert.equal(await people.getAttribute('max'), '4');
    assert.equal(await contact.getAttribute('maxlength'), '60');

    await driver.findElement(By.id('btn-confirmar')).click();
    assert.match(await driver.findElement(By.id('form-error')).getText(), /nombre y apellido/);

    await name.sendKeys('Ana123!');
    assert.equal(await name.getAttribute('value'), 'Ana ');
    await driver.findElement(By.id('btn-confirmar')).click();
    assert.match(await driver.findElement(By.id('form-error')).getText(), /nombre y apellido/);
    await name.clear();
    await name.sendKeys('Ana Pérez');
    await people.clear();
    await people.sendKeys('0');
    await driver.findElement(By.id('btn-confirmar')).click();
    assert.match(await driver.findElement(By.id('form-error')).getText(), /Indica cuántas personas/);
    await people.clear();
    await people.sendKeys('1.5');
    await driver.findElement(By.id('btn-confirmar')).click();
    assert.match(await driver.findElement(By.id('form-error')).getText(), /Indica cuántas personas/);
    await people.clear();
    await people.sendKeys('5');
    await driver.findElement(By.id('btn-confirmar')).click();
    assert.match(await driver.findElement(By.id('form-error')).getText(), /admite máximo 4 personas/);

    await name.clear();
    await name.sendKeys('Ana Selenium');
    await people.clear();
    await people.sendKeys('2');
    await contact.sendKeys('1'.repeat(80));
    assert.equal((await contact.getAttribute('value')).length, 60);
    await contact.clear();
    await contact.sendKeys('+57 (300) ABC-1234');
    assert.equal(await contact.getAttribute('value'), '573001234');
    await name.sendKeys('X'.repeat(100));
    assert.equal((await name.getAttribute('value')).length, 80);

    await name.clear();
    await name.sendKeys('Ana Selenium');
    await driver.findElement(By.id('btn-confirmar')).click();
    await driver.wait(until.elementLocated(By.css('.confirmacion h3')), 10000);
    assert.equal(
      await driver.executeScript('return window.__testDbWrites.filter(w => w.table === "reservas").length'),
      1,
    );
    const savedReservation = await driver.executeScript(
      'return window.__testDbWrites.find(w => w.table === "reservas").values[0]',
    );
    assert.equal(savedReservation.cliente_nombre, 'Ana Selenium');
    assert.equal(savedReservation.cliente_contacto, '573001234');
    assert.match(await driver.findElement(By.css('.resumen-final')).getText(), /Ana Selenium/);
  });

  it('valida los formularios administrativos de mesa, plato y horario', async () => {
    await driver.manage().window().setRect({ width: 1280, height: 900 });
    await driver.get(baseUrl);
    await driver.executeScript('sessionStorage.clear()');
    await driver.get(`${baseUrl}/admin.html`);
    await driver.wait(until.elementLocated(By.id('login-form')), 10000);

    await driver.findElement(By.id('correo')).sendKeys('admin@test.invalid');
    await driver.findElement(By.id('clave')).sendKeys('test-admin-password');
    await driver.findElement(By.css('#login-form button[type="submit"]')).click();
    await driver.wait(until.elementIsVisible(driver.findElement(By.id('app'))), 10000);

    await driver.findElement(By.id('btn-nueva-mesa')).click();
    await driver.findElement(By.css('#form-mesa button[type="submit"]')).click();
    assert.equal(await driver.findElement(By.id('m-error')).getText(), 'El nombre es obligatorio.');
    const tableName = driver.findElement(By.id('m-nombre'));
    assert.equal(await tableName.getAttribute('maxlength'), '40');
    assert.equal(await tableName.getAttribute('required'), 'true');
    await tableName.sendKeys('T'.repeat(50));
    assert.equal((await tableName.getAttribute('value')).length, 40);
    await tableName.clear();
    await tableName.sendKeys('Mesa inválida');
    const capacity = driver.findElement(By.id('m-capacidad'));
    assert.equal(await capacity.getAttribute('min'), '1');
    assert.equal(await capacity.getAttribute('max'), '50');
    await capacity.clear();
    await capacity.sendKeys('0');
    await driver.findElement(By.css('#form-mesa button[type="submit"]')).click();
    assert.match(await driver.findElement(By.id('m-error')).getText(), /entre 1 y 50/);
    await capacity.clear();
    await capacity.sendKeys('51');
    await driver.findElement(By.css('#form-mesa button[type="submit"]')).click();
    assert.match(await driver.findElement(By.id('m-error')).getText(), /entre 1 y 50/);
    await capacity.clear();
    await capacity.sendKeys('4.5');
    await driver.findElement(By.css('#form-mesa button[type="submit"]')).click();
    assert.match(await driver.findElement(By.id('m-error')).getText(), /entre 1 y 50/);
    await capacity.clear();
    await capacity.sendKeys('4');
    await driver.findElement(By.id('m-foto')).sendKeys('javascript:alert(1)');
    await driver.findElement(By.css('#form-mesa button[type="submit"]')).click();
    assert.match(await driver.findElement(By.id('m-error')).getText(), /URL que empiece por http/);
    await driver.findElement(By.id('m-foto')).clear();
    await driver.findElement(By.css('#form-mesa button[type="submit"]')).click();
    await driver.wait(until.elementIsNotVisible(driver.findElement(By.id('modal'))), 10000);
    await driver.wait(until.elementLocated(By.xpath("//td/strong[normalize-space()='Mesa inválida']")), 10000);
    assert.equal(
      await driver.executeScript('return window.__testDbWrites.filter(w => w.table === "mesas").length'),
      1,
    );
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(By.css('[data-editar="mesas-new-0"]')),
    );
    const editedTableName = driver.findElement(By.id('m-nombre'));
    await editedTableName.clear();
    await editedTableName.sendKeys('Mesa editada');
    await driver.findElement(By.css('#form-mesa button[type="submit"]')).click();
    await driver.wait(until.elementIsNotVisible(driver.findElement(By.id('modal'))), 10000);
    await driver.wait(until.elementLocated(By.xpath("//td/strong[normalize-space()='Mesa editada']")), 10000);

    await driver.executeScript(
      'arguments[0].checked = false; arguments[0].dispatchEvent(new Event("change", { bubbles: true }))',
      await driver.findElement(By.xpath("//tr[.//strong[normalize-space()='Mesa editada']]//input[@data-toggle]")),
    );
    await driver.wait(
      async () => (await driver.findElement(
        By.xpath("//tr[.//strong[normalize-space()='Mesa editada']]//small[@class='estado-txt']"),
      ).getText()) === 'Inactiva',
      10000,
    );
    await driver.executeScript('window.confirm = () => true');
    await driver.findElement(By.css('button[data-borrar="mesas-new-0"]')).click();
    await driver.wait(
      async () => (await driver.findElements(By.xpath("//td/strong[normalize-space()='Mesa editada']"))).length === 0,
      10000,
    );

    await driver.findElement(By.css('[data-vista="carta"]')).click();
    await driver.wait(until.elementLocated(By.id('btn-nuevo-plato')), 10000);
    await driver.findElement(By.id('btn-nuevo-plato')).click();
    await driver.findElement(By.css('#form-plato button[type="submit"]')).click();
    assert.equal(await driver.findElement(By.id('p-error')).getText(), 'El nombre es obligatorio.');
    const dishName = driver.findElement(By.id('p-nombre'));
    assert.equal(await dishName.getAttribute('maxlength'), '80');
    await dishName.sendKeys('P'.repeat(90));
    assert.equal((await dishName.getAttribute('value')).length, 80);
    await dishName.clear();
    await dishName.sendKeys('Pizza de prueba');
    const price = driver.findElement(By.id('p-precio'));
    assert.equal(await price.getAttribute('min'), '0');
    assert.equal(await price.getAttribute('step'), '500');
    await driver.findElement(By.css('#form-plato button[type="submit"]')).click();
    assert.match(await driver.findElement(By.id('p-error')).getText(), /precio válido en COP/);
    await price.sendKeys('-500');
    await driver.findElement(By.css('#form-plato button[type="submit"]')).click();
    assert.match(await driver.findElement(By.id('p-error')).getText(), /precio válido en COP/);
    await price.clear();
    await price.sendKeys('2500.5');
    await driver.findElement(By.css('#form-plato button[type="submit"]')).click();
    assert.match(await driver.findElement(By.id('p-error')).getText(), /múltiplos de 500/);
    await price.clear();
    await price.sendKeys('1250');
    await driver.findElement(By.css('#form-plato button[type="submit"]')).click();
    assert.match(await driver.findElement(By.id('p-error')).getText(), /múltiplos de 500/);
    await price.clear();
    await price.sendKeys('20000');
    const description = driver.findElement(By.id('p-desc'));
    await description.sendKeys('D'.repeat(320));
    assert.equal((await description.getAttribute('value')).length, 300);
    await driver.findElement(By.css('#form-plato button[type="submit"]')).click();
    await driver.wait(until.elementIsNotVisible(driver.findElement(By.id('modal'))), 10000);
    await driver.wait(until.elementLocated(By.xpath("//td/strong[normalize-space()='Pizza de prueba']")), 10000);
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(By.css('[data-editar="platos-new-0"]')),
    );
    const editedDishName = driver.findElement(By.id('p-nombre'));
    await editedDishName.clear();
    await editedDishName.sendKeys('Pizza editada');
    await driver.findElement(By.css('#form-plato button[type="submit"]')).click();
    await driver.wait(until.elementIsNotVisible(driver.findElement(By.id('modal'))), 10000);
    await driver.wait(until.elementLocated(By.xpath("//td/strong[normalize-space()='Pizza editada']")), 10000);
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(By.css('button[data-ocultar="platos-new-0"]')),
    );
    await driver.wait(
      until.elementLocated(By.xpath("//tr[.//strong[normalize-space()='Pizza editada']]//span[normalize-space()='Oculto']")),
      10000,
    );
    await driver.executeScript(
      'arguments[0].click()',
      await driver.findElement(By.css('button[data-borrar="platos-new-0"]')),
    );
    await driver.wait(
      async () => (await driver.findElements(By.xpath("//td/strong[normalize-space()='Pizza editada']"))).length === 0,
      10000,
    );

    await driver.findElement(By.css('[data-vista="reservas"]')).click();
    await driver.wait(until.elementLocated(By.id('filtros')), 10000);
    assert.equal(await driver.findElement(By.id('fl-fecha')).getAttribute('type'), 'date');
    assert.equal(await driver.findElement(By.id('fl-mesa')).isDisplayed(), true);
    assert.equal(await driver.findElement(By.id('fl-estado')).isDisplayed(), true);
    await driver.executeScript(
      'arguments[0].value = "2030-01-01"',
      await driver.findElement(By.id('fl-fecha')),
    );
    await driver.findElement(By.css('#filtros button[type="submit"]')).click();
    await driver.wait(
      until.elementLocated(By.xpath("//td/strong[normalize-space()='Reserva de prueba']")),
      10000,
    );
    await driver.executeScript(
      'arguments[0].value = "cancelada"; arguments[0].dispatchEvent(new Event("change", { bubbles: true }))',
      await driver.findElement(By.css('.estado-sel')),
    );
    await driver.wait(
      async () => (await driver.findElement(By.css('.estado-sel')).getAttribute('value')) === 'cancelada',
      10000,
    );
    await driver.executeScript('window.confirm = () => true');
    await driver.findElement(By.id('btn-limpiar-reservas')).click();
    await driver.wait(
      async () => (await driver.findElement(By.id('tabla-reservas')).getText()).includes('No hay reservas'),
      10000,
    );

    await driver.findElement(By.css('[data-vista="horarios"]')).click();
    const scheduleRow = driver.findElement(By.css('#tabla-horarios tbody tr'));
    await driver.wait(until.elementIsVisible(scheduleRow), 10000);
    const start = scheduleRow.findElement(By.css('.h-ini'));
    const end = scheduleRow.findElement(By.css('.h-fin'));
    const duration = scheduleRow.findElement(By.css('.h-dur'));
    const saveSchedule = scheduleRow.findElement(By.css('.h-guardar'));
    const setScheduleValue = (input, value) => driver.executeScript(
      'arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event("input", { bubbles: true }));',
      input,
      value,
    );
    const latestToast = () => driver.executeScript(
      'return [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent).at(-1)',
    );
    const writesBeforeScheduleChecks = await driver.executeScript('return window.__testDbWrites.length');
    assert.equal(writesBeforeScheduleChecks, 10);
    assert.equal(await duration.getAttribute('min'), '15');
    assert.equal(await duration.getAttribute('max'), '240');
    assert.equal(await duration.getAttribute('step'), '5');

    await start.clear();
    await saveSchedule.click();
    assert.match(await latestToast(), /Completa la hora de inicio y de fin/);
    await setScheduleValue(start, '19:00');
    await setScheduleValue(end, '18:00');
    await saveSchedule.click();
    assert.match(await latestToast(), /hora de fin debe ser mayor/);
    await setScheduleValue(start, '12:30');
    await setScheduleValue(end, '13:00');
    await saveSchedule.click();
    assert.match(await latestToast(), /duración del cupo es mayor que la jornada/);
    await setScheduleValue(end, '14:30');
    await setScheduleValue(duration, '10');
    await saveSchedule.click();
    assert.match(await latestToast(), /duración debe estar entre 15 y 240/);
    await setScheduleValue(duration, '16');
    await saveSchedule.click();
    assert.match(await latestToast(), /debe ser múltiplo de 5/);
    await setScheduleValue(duration, '245');
    await saveSchedule.click();
    assert.match(await latestToast(), /duración debe estar entre 15 y 240/);
    assert.equal(await driver.executeScript('return window.__testDbWrites.length'), writesBeforeScheduleChecks);
    await setScheduleValue(start, '12:30');
    await setScheduleValue(end, '14:30');
    await setScheduleValue(duration, '60');
    await saveSchedule.click();
    await driver.wait(async () => (await latestToast()) === 'Horario guardado.', 10000);
    assert.equal(await driver.executeScript('return window.__testDbWrites.length'), writesBeforeScheduleChecks + 1);

    await driver.findElement(By.id('btn-salir')).click();
    assert.equal(await driver.findElement(By.id('app')).isDisplayed(), false);
    assert.equal(await driver.findElement(By.id('login')).isDisplayed(), true);
  });

  it('aplica los cuatro niveles de permisos en el panel', async () => {
    await driver.get(baseUrl);
    await driver.get(`${baseUrl}/admin.html`);
    await driver.wait(until.elementLocated(By.id('login-form')), 10000);

    const iniciarComo = async (nivel) => {
      await driver.executeScript('window.__setTestRole(arguments[0])', nivel);
      await driver.findElement(By.id('correo')).sendKeys('admin@test.invalid');
      await driver.findElement(By.id('clave')).sendKeys('test-admin-password');
      await driver.findElement(By.css('#login-form button[type="submit"]')).click();
      await driver.wait(until.elementIsVisible(driver.findElement(By.id('app'))), 10000);
    };
    const cerrarSesion = async () => {
      await driver.findElement(By.id('btn-salir')).click();
      await driver.wait(until.elementIsVisible(driver.findElement(By.id('login'))), 10000);
    };

    await iniciarComo('consulta');
    assert.equal(await driver.findElement(By.css('[data-vista="reservas"]')).isDisplayed(), false);
    await driver.findElement(By.css('[data-vista="carta"]')).click();
    assert.equal(await driver.findElement(By.id('btn-nuevo-plato')).isDisplayed(), false);
    await cerrarSesion();

    await iniciarComo('operador');
    assert.equal(await driver.findElement(By.css('[data-vista="reservas"]')).isDisplayed(), true);
    await driver.findElement(By.css('[data-vista="reservas"]')).click();
    await driver.wait(until.elementLocated(By.css('.estado-sel')), 10000);
    assert.equal(await driver.findElement(By.css('.estado-sel')).isEnabled(), true);
    assert.equal(await driver.findElement(By.id('btn-limpiar-reservas')).isDisplayed(), false);
    await driver.findElement(By.css('[data-vista="mesas"]')).click();
    assert.equal(await driver.findElement(By.id('btn-nueva-mesa')).isDisplayed(), false);
    await cerrarSesion();

    await iniciarComo('gestor');
    assert.equal(await driver.findElement(By.id('btn-nueva-mesa')).isDisplayed(), true);
    assert.equal(await driver.findElement(By.css('[data-borrar]')).isDisplayed(), false);
    await cerrarSesion();

    await iniciarComo('administrador');
    assert.equal(await driver.findElement(By.css('[data-borrar]')).isDisplayed(), true);
    await cerrarSesion();
  });

  it('rechaza el acceso administrativo con contraseña incorrecta', async () => {
    await driver.get(baseUrl);
    await driver.executeScript('sessionStorage.clear()');
    await driver.get(`${baseUrl}/admin.html`);
    await driver.wait(until.elementLocated(By.id('login-form')), 10000);
    await driver.findElement(By.id('correo')).sendKeys('admin@test.invalid');
    await driver.findElement(By.id('clave')).sendKeys('clave-incorrecta-para-pruebas');
    await driver.findElement(By.css('#login-form button[type="submit"]')).click();

    assert.equal(await driver.findElement(By.id('login-error')).getText(), 'Correo o contraseña incorrectos.');
    assert.equal(await driver.findElement(By.id('app')).isDisplayed(), false);
  });
});
