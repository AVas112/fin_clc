const root = document.querySelector("#app");

root.innerHTML = `
  <main>
    <h1>Калькулятор юнит-экономики</h1>
    <section id="inputsSection" class="inputs-section">
      <h2>Входные данные</h2>
      <div class="form-grid" id="inputs">
        <label>
          Фиксированные расходы (₽/мес.)
          <input type="number" id="opex" value="160000" min="0" step="1000" />
        </label>
        <label>
          CAC - стоимость привлечения клиента (₽)
          <input type="number" id="cac" value="10000" min="0" step="500" />
        </label>
        <label>
          Часы на внедрение (часы)
          <input type="number" id="hours" value="8" min="0" step="1" />
        </label>
        <label>
          Ставка специалиста (₽/час)
          <input type="number" id="rate" value="1000" min="0" step="100" />
        </label>
        <label>
          Выручка за внедрение (₽)
          <input type="number" id="implementationRevenue" value="30000" min="0" step="1000" />
        </label>
        <label>
          Ежемесячная абонентская плата (₽)
          <input type="number" id="subscriptionRevenue" value="5000" min="0" step="500" />
        </label>
        <label>
          <span class="label-row">
            Пробный период
            <span class="tooltip">
              <button class="tooltip-trigger" type="button" aria-describedby="tip-trial" aria-label="Пояснение пробного периода">i</button>
              <span role="tooltip" id="tip-trial" class="tooltip-content">В течение пробного периода клиент не оплачивает подписку. Это сдвигает начало подписочных поступлений, снижая LTV за выбранный горизонт и перенося точку выхода в операционный плюс на более поздние месяцы.</span>
            </span>
          </span>
          <select id="trialPeriod">
            <option value="0">0</option>
            <option value="0.25">1 неделя</option>
            <option value="0.5">2 недели</option>
            <option value="1">1 месяц</option>
            <option value="2">2 месяца</option>
            <option value="3">3 месяца</option>
          </select>
        </label>
        <label>
          Новые клиенты в месяц (шт.)
          <input type="number" id="newClientsPerMonth" value="5" min="0" step="1" />
        </label>
      </div>
    </section>
    <div id="inputsSticky" class="inputs-sticky" aria-hidden="true">
      <button id="inputsStickyToggle" class="inputs-sticky-btn" type="button" aria-expanded="false" aria-controls="inputsDrawer">Входные данные</button>
    </div>
    <div id="inputsBackdrop" class="inputs-backdrop" hidden></div>
    <div id="inputsDrawer" class="inputs-drawer" role="dialog" aria-modal="true" aria-labelledby="inputsDrawerTitle" hidden>
      <div class="inputs-drawer-header">
        <strong id="inputsDrawerTitle">Входные данные</strong>
        <button id="inputsDrawerClose" class="inputs-drawer-close" type="button" aria-label="Свернуть">×</button>
      </div>
      <div id="inputsDrawerContent" class="inputs-drawer-content"></div>
    </div>
    <section>
      <h2>Результаты</h2>
      <div class="output-grid" id="outputs"></div>
      <p class="note" id="notes"></p>
    </section>
  </main>
`;

const numberFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const integerFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});

const inputs = {
  opex: root.querySelector("#opex"),
  cac: root.querySelector("#cac"),
  hours: root.querySelector("#hours"),
  rate: root.querySelector("#rate"),
  implementationRevenue: root.querySelector("#implementationRevenue"),
  subscriptionRevenue: root.querySelector("#subscriptionRevenue"),
  trialPeriod: root.querySelector("#trialPeriod"),
  newClientsPerMonth: root.querySelector("#newClientsPerMonth"),
};

const outputs = root.querySelector("#outputs");
const notes = root.querySelector("#notes");

function sanitize(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatClients(value) {
  if (!Number.isFinite(value) || value === Infinity) return "—";
  return integerFormatter.format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(0)} %`;
}

let ltvMonthsState = 12;
let chartMonthsState = 12;
let revenueModeState = "subscription"; // 'subscription' | 'total'
let revMetricState = "revenue"; // 'revenue' | 'profit'
let revenueChartMonthsState = 12; // 12 | 24

function calculate() {
  const opex = sanitize(inputs.opex.value);
  const cac = sanitize(inputs.cac.value);
  const hours = sanitize(inputs.hours.value);
  const rate = sanitize(inputs.rate.value);
  const implementationRevenue = sanitize(inputs.implementationRevenue.value);
  const subscriptionRevenue = sanitize(inputs.subscriptionRevenue.value);
  const trialMonths = Math.max(0, sanitize(inputs.trialPeriod.value, 0));
  const newClients = Math.max(0, sanitize(inputs.newClientsPerMonth.value, 0));
  const ltvMonths = Math.max(1, sanitize(ltvMonthsState, 12));
  const chartMonths = Math.max(1, sanitize(chartMonthsState, 12));

  const laborCost = hours * rate;
  const implementationCost = cac + laborCost;
  const implementationProfit = implementationRevenue - implementationCost;
  const breakEvenImplementation = implementationProfit > 0 ? Math.ceil(opex / implementationProfit) : Infinity;
  const breakEvenSubscription = subscriptionRevenue > 0 ? Math.ceil(opex / subscriptionRevenue) : Infinity;
  const clientsAtBreakEven = Number.isFinite(breakEvenImplementation) ? breakEvenImplementation : null;
  const totalFromImplementations = clientsAtBreakEven != null ? clientsAtBreakEven * implementationProfit : null;
  const totalFromSubscription = clientsAtBreakEven != null ? clientsAtBreakEven * subscriptionRevenue : null;

  // Эффективное число платящих месяцев за выбранный горизонт LTV с учётом пробного периода
  const effectiveLtvMonths = Math.max(0, ltvMonths - trialMonths);
  const classicLtv = subscriptionRevenue * effectiveLtvMonths;
  const extendedLtv = implementationProfit + classicLtv;
  const ltvCacClassic = cac > 0 ? classicLtv / cac : Infinity;

  // Маржинальности
  const extendedRevenue = implementationRevenue + subscriptionRevenue * effectiveLtvMonths; // суммарная выручка за горизонт (внедрение + подписка)
  const lifetimeProfit = extendedLtv; // прибыль за горизонт = прибыль внедрения + подписка (с учётом пробного периода)
  const implementationMargin = implementationRevenue > 0 ? implementationProfit / implementationRevenue : NaN;
  const lifetimeMargin = extendedRevenue > 0 ? lifetimeProfit / extendedRevenue : NaN;
  // Плато помесячно: активные = newClients × LTV (после пробного периода)
  const plateauActive = newClients * ltvMonths;
  const plateauSubRevenue = plateauActive * subscriptionRevenue;
  const plateauTotalRevenue = newClients * implementationRevenue + plateauSubRevenue;
  const plateauMonthlyProfit = newClients * implementationProfit + plateauSubRevenue - opex;
  const plateauMargin = plateauTotalRevenue > 0 ? plateauMonthlyProfit / plateauTotalRevenue : NaN;

  // Динамика по месяцам
  const monthly = [];
  const cumulative = [];
  const monthlySubRevenue = []; // подписочная выручка за месяц
  const monthlyTotalRevenue = []; // внедрение + подписка за месяц
  const monthlySubProfit = []; // подписочная прибыль за месяц (учитывает фикс. расходы)
  const monthlyTotalProfit = []; // общая прибыль за месяц (у нас это monthly)
  let cum = 0;
  const maxMonths = Math.max(chartMonths, revenueChartMonthsState);
  for (let m = 1; m <= maxMonths; m++) {
    // Активные платящие клиенты с учётом пробного периода d (в мес.) и горизонта жизни LTV
    // Для постоянного притока cohorts: active = newClients * clamp(m - d, 0, ltvMonths)
    const activeClients = newClients * Math.max(0, Math.min(m - trialMonths, ltvMonths));
    const monthlyProfit = newClients * implementationProfit + activeClients * subscriptionRevenue - opex;
    const subRevenue = activeClients * subscriptionRevenue;
    const totalRevenue = newClients * implementationRevenue + subRevenue;
    cum += monthlyProfit;
    monthly.push(monthlyProfit);
    cumulative.push(cum);
    monthlySubRevenue.push(subRevenue);
    monthlyTotalRevenue.push(totalRevenue);
    monthlySubProfit.push(subRevenue - opex);
    monthlyTotalProfit.push(monthlyProfit);
  }
  

  // Человекочитаемый тултип для графика месячной выручки с формулами и подстановкой
  const revM = Math.min(revenueChartMonthsState, Math.max(1, ltvMonths));
  const monthsPaidExample = Math.max(0, Math.min(revM - trialMonths, ltvMonths));
  const activeAtExample = newClients * monthsPaidExample;
  const subAtExample = activeAtExample * subscriptionRevenue;
  const totalAtExample = newClients * implementationRevenue + subAtExample;
  const revTip = `График показывает выручку за каждый месяц.\n\n` +
    `Режим «только подписка».\n` +
    `Как считаем: подписочная выручка за выбранный месяц = число активных платящих клиентов в этом месяце × абонентская плата.\n` +
    `Активные платящие клиенты в месяце — это новые клиенты × количество месяцев, за которые уже идёт оплата к этому моменту (после пробного периода), но не меньше 0 и не больше LTV.\n` +
    `Подстановка для месяца ${integerFormatter.format(revM)}: оплачиваемых месяцев = ${monthsPaidExample.toLocaleString('ru-RU')}; активные клиенты = ${integerFormatter.format(newClients)} × ${monthsPaidExample.toLocaleString('ru-RU')} = ${integerFormatter.format(activeAtExample)}; выручка = ${integerFormatter.format(activeAtExample)} × ${numberFormatter.format(subscriptionRevenue)} = ${numberFormatter.format(subAtExample)}.\n\n` +
    `Режим «всего (внедрение + подписка)».\n` +
    `Как считаем: выручка месяца = новые клиенты × выручка за внедрение + подписочная выручка месяца.\n` +
    `Подстановка для месяца ${integerFormatter.format(revM)}: ${integerFormatter.format(newClients)} × ${numberFormatter.format(implementationRevenue)} + ${integerFormatter.format(activeAtExample)} × ${numberFormatter.format(subscriptionRevenue)} = ${numberFormatter.format(totalAtExample)}.`;

  outputs.innerHTML = `
    <div class="card">
      <strong>${numberFormatter.format(implementationRevenue)}</strong>
      <span>Выручка за одно внедрение</span>
    </div>
    <div class="card">
      <strong>${numberFormatter.format(implementationCost)}</strong>
      <span>Переменные затраты на внедрение (CAC + работа)</span>
    </div>
    <div class="card">
      <strong>${numberFormatter.format(implementationProfit)}</strong>
      <span class="tooltip">
        <button class="tooltip-trigger" type="button" aria-describedby="tip-impl-profit" aria-label="Пояснение расчета">i</button>
        <span role="tooltip" id="tip-impl-profit" class="tooltip-content">Формула: прибыль = выручка − (CAC + часы×ставка).<br/>Подстановка: ${numberFormatter.format(implementationRevenue)} − (${numberFormatter.format(cac)} + ${integerFormatter.format(hours)}×${numberFormatter.format(rate)}/ч) = ${numberFormatter.format(implementationProfit)}.</span>
      </span>
      <span>Прибыль с одного внедрения</span>
    </div>
    <div class="break-even-row">
      <div class="card">
        <strong>${formatClients(breakEvenImplementation)}</strong>
        <span class="tooltip">
          <button class="tooltip-trigger" type="button" aria-describedby="tip-break-impl" aria-label="Пояснение расчета">i</button>
          <span role="tooltip" id="tip-break-impl" class="tooltip-content">${implementationProfit > 0
              ? `Формула: округление вверх (фикс. расходы / прибыль за внедрение).<br/>Подстановка: округление вверх (${numberFormatter.format(opex)} / ${numberFormatter.format(implementationProfit)}) = ${formatClients(breakEvenImplementation)}.`
              : `Прибыль за внедрение ≤ 0, поэтому точка безубыточности по внедрениям не определяется.`}</span>
        </span>
        <span>Точка безубыточности по внедрениям (клиентов в 1-й месяц)</span>
      </div>
      <div class="card">
        <strong>${formatClients(breakEvenSubscription)}</strong>
        <span class="tooltip">
          <button class="tooltip-trigger" type="button" aria-describedby="tip-break-sub" aria-label="Пояснение расчета">i</button>
          <span role="tooltip" id="tip-break-sub" class="tooltip-content">${subscriptionRevenue > 0
              ? `Формула: округление вверх (фикс. расходы / абонплата).<br/>Подстановка: округление вверх (${numberFormatter.format(opex)} / ${numberFormatter.format(subscriptionRevenue)}) = ${formatClients(breakEvenSubscription)}.`
              : `Абонентская плата не задана, поэтому точка безубыточности по подписке не рассчитывается.`}</span>
        </span>
        <span>Точка безубыточности по подписке (активных клиентов)</span>
      </div>
    </div>
    <div class="card summary-card">
      <div class="summary-item">
        <strong>${totalFromImplementations != null ? numberFormatter.format(totalFromImplementations) : "—"}</strong>
        <span class="tooltip">
          <button class="tooltip-trigger" type="button" aria-describedby="tip-sum-impl" aria-label="Пояснение расчета">i</button>
          <span role="tooltip" id="tip-sum-impl" class="tooltip-content">Формула: сумма от внедрений = (клиентов на точке безубыточности по внедрениям) × (прибыль с одного внедрения).<br/>Подстановка: ${clientsAtBreakEven != null ? `${formatClients(clientsAtBreakEven)} × ${numberFormatter.format(implementationProfit)} = ${numberFormatter.format(totalFromImplementations)}` : "не рассчитывается (точка безубыточности по внедрениям не определена)"}.</span>
        </span>
        <span>Сумма от внедрений при точке безубыточности</span>
      </div>
      <div class="summary-item">
        <strong>${totalFromSubscription != null ? numberFormatter.format(totalFromSubscription) : "—"}</strong>
        <span class="tooltip">
          <button class="tooltip-trigger" type="button" aria-describedby="tip-sum-sub" aria-label="Пояснение расчета">i</button>
          <span role="tooltip" id="tip-sum-sub" class="tooltip-content">Формула: сумма от подписки = (клиентов на точке безубыточности по внедрениям) × (ежемесячная абонентская плата).<br/>Подстановка: ${clientsAtBreakEven != null && subscriptionRevenue > 0 ? `${formatClients(clientsAtBreakEven)} × ${numberFormatter.format(subscriptionRevenue)} = ${numberFormatter.format(totalFromSubscription)}` : "не рассчитывается (нет точки безубыточности или абонплата не задана)"}.</span>
        </span>
        <span>Сумма от подписки при точке безубыточности</span>
      </div>
    </div>
    <div class="card ltv-card">
      <div class="ltv-item">
        <strong>${numberFormatter.format(classicLtv)}</strong>
        <span class="tooltip">
          <button class="tooltip-trigger" type="button" aria-describedby="tip-ltv-classic" aria-label="Пояснение расчета">i</button>
          <span role="tooltip" id="tip-ltv-classic" class="tooltip-content">LTV (классический) — доход от подписки за выбранный горизонт с учётом пробного периода (в это время клиент не платит). Формула: LTVкласс = абонплата × платящие_месяцы, где платящие_месяцы = max(0, срок − пробный_период).<br/>Подстановка: ${numberFormatter.format(subscriptionRevenue)} × ${integerFormatter.format(Math.max(0, ltvMonths - trialMonths))} = ${numberFormatter.format(classicLtv)}.</span>
        </span>
        <span>
          LTV (классический) за 
          <select id="ltvMonths" class="ltv-select" aria-label="Горизонт LTV, месяцев">
            <option value="3" ${ltvMonths === 3 ? "selected" : ""}>3</option>
            <option value="6" ${ltvMonths === 6 ? "selected" : ""}>6</option>
            <option value="12" ${ltvMonths === 12 ? "selected" : ""}>12</option>
            <option value="24" ${ltvMonths === 24 ? "selected" : ""}>24</option>
          </select>
          мес.
        </span>
      </div>
      <div class="ltv-item">
        <strong>${numberFormatter.format(extendedLtv)}</strong>
        <span class="tooltip">
          <button class="tooltip-trigger" type="button" aria-describedby="tip-ltv-extended" aria-label="Пояснение расчета">i</button>
          <span role="tooltip" id="tip-ltv-extended" class="tooltip-content">LTV (расширенный) — классический LTV с добавлением разовой прибыли от внедрения; показывает общий вклад клиента за первый жизненный цикл, учитывая стартовый платеж. Формула: LTVрасш = LTVкласс + прибыль с внедрения.<br/>Подстановка: ${numberFormatter.format(classicLtv)} + ${numberFormatter.format(implementationProfit)} = ${numberFormatter.format(extendedLtv)}.</span>
        </span>
        <span>LTV (расширенный, с внедрением)</span>
      </div>
      <div class="ltv-item">
        <strong>${Number.isFinite(ltvCacClassic) ? ltvCacClassic.toFixed(2) : "—"}</strong>
        <span class="tooltip">
          <button class="tooltip-trigger" type="button" aria-describedby="tip-ltvcac-classic" aria-label="Пояснение расчета">i</button>
          <span role="tooltip" id="tip-ltvcac-classic" class="tooltip-content">LTV/CAC — показывает, сколько рублей суммарного дохода с подписки приходится на 1 рубль привлечения клиента; устойчивой обычно считают модель с LTV/CAC ≥ 3. Формула: LTV/CAC = LTVкласс / CAC.<br/>Подстановка: ${Number.isFinite(ltvCacClassic) ? `${numberFormatter.format(classicLtv)} / ${numberFormatter.format(cac)} = ${ltvCacClassic.toFixed(2)}` : "не рассчитывается (CAC = 0)"}.</span>
        </span>
        <span>Соотношение LTV/CAC (на основе LTV классического)</span>
      </div>
    </div>
    
    <div class="card ltv-card">
      <div class="ltv-item">
        <strong>${formatPercent(implementationMargin)}</strong>
        <span class="tooltip">
          <button class="tooltip-trigger" type="button" aria-describedby="tip-margin-impl" aria-label="Пояснение расчета">i</button>
          <span role="tooltip" id="tip-margin-impl" class="tooltip-content">Маржинальность внедрения показывает, какая доля выручки от одного внедрения остается как прибыль после затрат на привлечение (CAC) и работы. Формула: маржа внедрения = (выручка − (CAC + часы×ставка)) / выручка × 100%.<br/>Подстановка: (${numberFormatter.format(implementationRevenue)} − (${numberFormatter.format(cac)} + ${integerFormatter.format(hours)}×${numberFormatter.format(rate)}/ч)) / ${numberFormatter.format(implementationRevenue)} = ${formatPercent(implementationMargin)}.</span>
        </span>
        <span>Маржа внедрения</span>
      </div>
      <div class="ltv-item">
        <strong>${formatPercent(lifetimeMargin)}</strong>
        <span class="tooltip">
          <button class="tooltip-trigger" type="button" aria-describedby="tip-margin-ltv" aria-label="Пояснение расчета">i</button>
          <span role="tooltip" id="tip-margin-ltv" class="tooltip-content">Маржа за жизненный цикл (за выбранный горизонт) — доля прибыли с клиента относительно суммарной выручки (внедрение + подписка), с учётом пробного периода. Формула: маржа_LTV = (прибыль внедрения + абонплата × платящие_месяцы) / (выручка внедрения + абонплата × платящие_месяцы) × 100%, где платящие_месяцы = max(0, срок − пробный_период).<br/>Подстановка: (${numberFormatter.format(implementationProfit)} + ${numberFormatter.format(subscriptionRevenue)}×${integerFormatter.format(effectiveLtvMonths)}) / (${numberFormatter.format(implementationRevenue)} + ${numberFormatter.format(subscriptionRevenue)}×${integerFormatter.format(effectiveLtvMonths)}) = ${formatPercent(lifetimeMargin)}.</span>
        </span>
        <span>Маржа за жизненный цикл (за выбранный горизонт)</span>
      </div>
      <div class="ltv-item">
        <strong>${formatPercent(plateauMargin)}</strong>
        <span class="tooltip">
          <button class="tooltip-trigger" type="button" aria-describedby="tip-margin-plateau" aria-label="Пояснение расчета">i</button>
          <span role="tooltip" id="tip-margin-plateau" class="tooltip-content">Месячная маржа на плато — доля прибыли в выручке в устойчивом состоянии, когда отписки примерно равны притоку (через LTV месяцев после пробного периода). Формула: маржа_месяца = прибыль_месяца / выручка_месяца × 100%, где прибыль_месяца = новые_клиенты × прибыль_внедрения + (активные_клиенты × абонплата) − фикс. расходы; активные_клиенты на плато = новые_клиенты × LTV.<br/>Подстановка: прибыль_месяца = ${integerFormatter.format(newClients)}×${numberFormatter.format(implementationProfit)} + (${integerFormatter.format(plateauActive)}×${numberFormatter.format(subscriptionRevenue)}) − ${numberFormatter.format(opex)} = ${numberFormatter.format(plateauMonthlyProfit)}; выручка_месяца = ${integerFormatter.format(newClients)}×${numberFormatter.format(implementationRevenue)} + (${integerFormatter.format(plateauActive)}×${numberFormatter.format(subscriptionRevenue)}) = ${numberFormatter.format(plateauTotalRevenue)}; маржа = ${formatPercent(plateauMargin)}.</span>
        </span>
        <span>Месячная маржа на плато</span>
      </div>
    </div>
    
    <div class="card chart-card">
      <div class="chart-header">
        <strong>Кумулятивная прибыль по месяцам</strong>
        <span>
          за 
          <select id="chartMonths" class="ltv-select" aria-label="Горизонт графика, месяцев">
            <option value="3" ${chartMonths === 3 ? "selected" : ""}>3</option>
            <option value="6" ${chartMonths === 6 ? "selected" : ""}>6</option>
            <option value="12" ${chartMonths === 12 ? "selected" : ""}>12</option>
            <option value="24" ${chartMonths === 24 ? "selected" : ""}>24</option>
          </select>
          мес.
        </span>
        <span class="tooltip">
          <button class="tooltip-trigger" type="button" aria-describedby="tip-chart" aria-label="Пояснение расчета">i</button>
          <span role="tooltip" id="tip-chart" class="tooltip-content">На графике показана накопленная прибыль: в каждом месяце учитывается прибыль от внедрений (разовый доход в месяц привлечения), подписка от накопившейся платящей базы с учётом пробного периода и вычитаются фиксированные расходы. Положительное значение означает выход в операционный плюс.</span>
        </span>
      </div>
      <svg id="cumChart" viewBox="0 0 800 240" preserveAspectRatio="none" aria-label="График кумулятивной прибыли"></svg>
      <div id="cumTooltip" class="chart-tooltip" role="status" aria-live="polite"></div>
      <div class="chart-x-axis">Месяцы 1…${integerFormatter.format(chartMonths)}</div>
    </div>
    <div class="card chart-card">
      <div class="chart-header">
        <strong>Месячная</strong>
        <span>
          <select id="revMetric" class="ltv-select" aria-label="Метрика: выручка или прибыль">
            <option value="revenue" ${revMetricState === "revenue" ? "selected" : ""}>выручка</option>
            <option value="profit" ${revMetricState === "profit" ? "selected" : ""}>прибыль</option>
          </select>
        </span>
        <span>
          режим 
          <select id="revMode" class="ltv-select" aria-label="Режим графика: только подписка или всего">
            <option value="subscription" ${revenueModeState === "subscription" ? "selected" : ""}>только подписка</option>
            <option value="total" ${revenueModeState === "total" ? "selected" : ""}>всего (внедрение + подписка)</option>
          </select>
        </span>
        <span>
          за 
          <select id="revMonths" class="ltv-select" aria-label="Горизонт графика выручки, месяцев">
            <option value="12" ${revenueChartMonthsState === 12 ? "selected" : ""}>12</option>
            <option value="24" ${revenueChartMonthsState === 24 ? "selected" : ""}>24</option>
          </select>
          мес.
        </span>
        <span class="tooltip">
          <button class="tooltip-trigger" type="button" aria-describedby="tip-rev-chart" aria-label="Пояснение расчета">i</button>
          <span role="tooltip" id="tip-rev-chart" class="tooltip-content">${revTip.replace(/\n/g, '<br/>')}</span>
        </span>
      </div>
      <svg id="revChart" viewBox="0 0 800 240" preserveAspectRatio="none" aria-label="График месячной выручки"></svg>
      <div id="revTooltip" class="chart-tooltip" role="status" aria-live="polite"></div>
      <div class="chart-x-axis">Месяцы 1…${integerFormatter.format(revenueChartMonthsState)}</div>
    </div>
  `;

  // Отрисовка графика кумулятивной прибыли с сеткой, подписью, заливкой и ховером
  const svg = document.getElementById("cumChart");
  if (svg) {
    const rect = svg.getBoundingClientRect();
    const width = Math.max(600, Math.floor(rect.width));
    const height = 240;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const pad = { left: 76, right: 14, top: 16, bottom: 32 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;

    const dataFull = cumulative;
    const data = dataFull.slice(0, chartMonths);
    const minY = Math.min(0, ...data);
    const maxY = Math.max(0, ...data);
    const rangeY = maxY - minY || 1;
    const n = data.length;
    const stepX = n > 1 ? w / (n - 1) : w;

    const yScale = (v) => pad.top + h - ((v - minY) / rangeY) * h;
    const xScale = (i) => pad.left + i * stepX;

    // Освежаем
    svg.innerHTML = "";

    // Градиент для заливки
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    grad.setAttribute("id", "cumGradient");
    grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0");
    grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
    const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop1.setAttribute("offset", "0%"); stop1.setAttribute("stop-color", "#6366f1"); stop1.setAttribute("stop-opacity", "0.25");
    const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop2.setAttribute("offset", "100%"); stop2.setAttribute("stop-color", "#6366f1"); stop2.setAttribute("stop-opacity", "0.02");
    grad.appendChild(stop1); grad.appendChild(stop2); defs.appendChild(grad); svg.appendChild(defs);

    // Сетка Y (5 линий) и подписи
    const gridGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gridGroup.setAttribute("class", "chart-grid");
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const v = minY + (rangeY * i) / ticks;
      const y = yScale(v);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", pad.left);
      line.setAttribute("y1", y);
      line.setAttribute("x2", pad.left + w);
      line.setAttribute("y2", y);
      gridGroup.appendChild(line);

      // Подпись слева
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", pad.left - 8);
      label.setAttribute("y", y + 4);
      label.setAttribute("text-anchor", "end");
      label.setAttribute("font-size", "12");
      label.setAttribute("fill", "#6b7280");
      label.textContent = numberFormatter.format(v);
      svg.appendChild(label);
    }
    svg.appendChild(gridGroup);

    // Ось нуля
    const zeroY = yScale(0);
    const zeroGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    zeroGroup.setAttribute("class", "chart-zero");
    const zeroLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    zeroLine.setAttribute("x1", pad.left);
    zeroLine.setAttribute("y1", zeroY);
    zeroLine.setAttribute("x2", pad.left + w);
    zeroLine.setAttribute("y2", zeroY);
    zeroGroup.appendChild(zeroLine);
    svg.appendChild(zeroGroup);

    // Линия данных
    let d = "";
    data.forEach((v, i) => {
      const x = xScale(i);
      const y = yScale(v);
      d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });

    // Заливка под кривой
    const areaPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const areaD = `${d} L ${pad.left + w} ${yScale(minY)} L ${pad.left} ${yScale(minY)} Z`;
    areaPath.setAttribute("d", areaD);
    areaPath.setAttribute("class", "chart-area");
    svg.appendChild(areaPath);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#6366f1");
    path.setAttribute("stroke-width", "2.5");
    svg.appendChild(path);

    // Точки
    const points = [];
    data.forEach((v, i) => {
      const cx = xScale(i);
      const cy = yScale(v);
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", "2.5");
      circle.setAttribute("fill", "#1e3a8a");
      svg.appendChild(circle);
      points.push({ cx, cy });
    });

    // Ховер‑интерактив: ближайшая точка + тултип
    const tooltip = document.getElementById("cumTooltip");
    const focus = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    focus.setAttribute("r", "5");
    focus.setAttribute("class", "chart-focus-point");
    focus.style.display = "none";
    svg.appendChild(focus);

    const onMove = (evt) => {
      const box = svg.getBoundingClientRect();
      const mx = evt.clientX - box.left;
      // находим ближайший индекс
      let idx = 0; let best = Infinity;
      points.forEach((p, i) => {
        const dx = Math.abs(p.cx - mx);
        if (dx < best) { best = dx; idx = i; }
      });
      const p = points[idx];
      focus.style.display = "";
      focus.setAttribute("cx", p.cx);
      focus.setAttribute("cy", p.cy);
      if (tooltip) {
        tooltip.style.display = "block";
        tooltip.style.left = `${p.cx}px`;
        tooltip.style.top = `${p.cy + pad.top}px`;
        const month = idx + 1;
        const monthProfit = monthly[idx];
        const cumProfit = data[idx];
        const monthlyFormula = `Помесячно = новые клиенты × прибыль с внедрения + (активные клиенты × абонплата) − фикс. расходы, где активные клиенты = новые клиенты × clamp(месяц − ${trialMonths}, 0…${ltvMonths}).`;
        const activeClientsNow = newClients * Math.max(0, Math.min(month - trialMonths, ltvMonths));
        const monthlySub = `${integerFormatter.format(newClients)} × ${numberFormatter.format(implementationProfit)} + (${integerFormatter.format(activeClientsNow)} × ${numberFormatter.format(subscriptionRevenue)}) − ${numberFormatter.format(opex)} = ${numberFormatter.format(monthly[idx])}.`;
        const cumFormula = `Кумулятивно = сумма помесячной прибыли за 1…${integerFormatter.format(month)}.`;
        tooltip.innerHTML = `Месяц ${integerFormatter.format(month)}<br/>${monthlyFormula}<br/>Подстановка: ${monthlySub}<br/>Итого к концу месяца: ${numberFormatter.format(cumProfit)}`;
      }
    };
    const onLeave = () => {
      focus.style.display = "none";
      if (tooltip) tooltip.style.display = "none";
    };
    svg.addEventListener("mousemove", onMove);
    svg.addEventListener("mouseleave", onLeave);
  }

  // Отрисовка графика месячной выручки (по аналогии с кумулятивным)
  const rsvg = document.getElementById("revChart");
  if (rsvg) {
    const rect = rsvg.getBoundingClientRect();
    const width = Math.max(600, Math.floor(rect.width));
    const height = 240;
    rsvg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const pad = { left: 76, right: 14, top: 16, bottom: 32 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;

    let dataFull;
    if (revMetricState === "revenue") {
      dataFull = revenueModeState === "subscription" ? monthlySubRevenue : monthlyTotalRevenue;
    } else {
      dataFull = revenueModeState === "subscription" ? monthlySubProfit : monthlyTotalProfit;
    }
    const data = dataFull.slice(0, revenueChartMonthsState);
    const minY = Math.min(0, ...data); // прибыль может быть отрицательной
    const maxY = Math.max(0, ...data);
    const rangeY = maxY - minY || 1;
    const n = data.length;
    const stepX = n > 1 ? w / (n - 1) : w;

    const yScale = (v) => pad.top + h - ((v - minY) / rangeY) * h;
    const xScale = (i) => pad.left + i * stepX;

    // Освежаем
    rsvg.innerHTML = "";

    // Градиент для заливки (тот же id пригоден, т.к. id в пределах конкретного svg)
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    grad.setAttribute("id", "cumGradient");
    grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0");
    grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
    const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop1.setAttribute("offset", "0%"); stop1.setAttribute("stop-color", "#6366f1"); stop1.setAttribute("stop-opacity", "0.25");
    const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop2.setAttribute("offset", "100%"); stop2.setAttribute("stop-color", "#6366f1"); stop2.setAttribute("stop-opacity", "0.02");
    grad.appendChild(stop1); grad.appendChild(stop2); defs.appendChild(grad); rsvg.appendChild(defs);

    // Сетка Y и подписи
    const gridGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gridGroup.setAttribute("class", "chart-grid");
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const v = minY + (rangeY * i) / ticks;
      const y = yScale(v);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", pad.left);
      line.setAttribute("y1", y);
      line.setAttribute("x2", pad.left + w);
      line.setAttribute("y2", y);
      gridGroup.appendChild(line);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", pad.left - 8);
      label.setAttribute("y", y + 4);
      label.setAttribute("text-anchor", "end");
      label.setAttribute("font-size", "12");
      label.setAttribute("fill", "#6b7280");
      label.textContent = numberFormatter.format(v);
      rsvg.appendChild(label);
    }
    rsvg.appendChild(gridGroup);

    // Ось нуля (как на кумулятивном графике)
    const zeroY = yScale(0);
    const zeroGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    zeroGroup.setAttribute("class", "chart-zero");
    const zeroLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    zeroLine.setAttribute("x1", pad.left);
    zeroLine.setAttribute("y1", zeroY);
    zeroLine.setAttribute("x2", pad.left + w);
    zeroLine.setAttribute("y2", zeroY);
    zeroGroup.appendChild(zeroLine);
    rsvg.appendChild(zeroGroup);

    // Линия данных
    let d = "";
    data.forEach((v, i) => {
      const x = xScale(i);
      const y = yScale(v);
      d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });

    // Заливка под кривой
    const areaPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const areaD = `${d} L ${pad.left + w} ${yScale(minY)} L ${pad.left} ${yScale(minY)} Z`;
    areaPath.setAttribute("d", areaD);
    areaPath.setAttribute("class", "chart-area");
    rsvg.appendChild(areaPath);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#6366f1");
    path.setAttribute("stroke-width", "2.5");
    rsvg.appendChild(path);

    // Точки
    const points = [];
    data.forEach((v, i) => {
      const cx = xScale(i);
      const cy = yScale(v);
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", "2.5");
      circle.setAttribute("fill", "#1e3a8a");
      rsvg.appendChild(circle);
      points.push({ cx, cy });
    });

    // Ховер и тултип
    const tooltip = document.getElementById("revTooltip");
    const focus = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    focus.setAttribute("r", "5");
    focus.setAttribute("class", "chart-focus-point");
    focus.style.display = "none";
    rsvg.appendChild(focus);

    const onMove = (evt) => {
      const box = rsvg.getBoundingClientRect();
      const mx = evt.clientX - box.left;
      let idx = 0; let best = Infinity;
      points.forEach((p, i) => {
        const dx = Math.abs(p.cx - mx);
        if (dx < best) { best = dx; idx = i; }
      });
      const p = points[idx];
      focus.style.display = "";
      focus.setAttribute("cx", p.cx);
      focus.setAttribute("cy", p.cy);
      if (tooltip) {
        tooltip.style.display = "block";
        tooltip.style.left = `${p.cx}px`;
        tooltip.style.top = `${p.cy + pad.top}px`;
        const month = idx + 1;
        const activeClientsNow = newClients * Math.max(0, Math.min(month - trialMonths, ltvMonths));
        const sub = activeClientsNow * subscriptionRevenue;
        if (revMetricState === "revenue") {
          if (revenueModeState === "subscription") {
            tooltip.innerHTML = `Месяц ${integerFormatter.format(month)}<br/>Формула: активные клиенты × абонплата<br/>Подстановка: ${integerFormatter.format(activeClientsNow)} × ${numberFormatter.format(subscriptionRevenue)} = ${numberFormatter.format(sub)}`;
          } else {
            const total = newClients * implementationRevenue + sub;
            tooltip.innerHTML = `Месяц ${integerFormatter.format(month)}<br/>Формула: новые клиенты × выручка за внедрение + (активные клиенты × абонплата)<br/>Подстановка: ${integerFormatter.format(newClients)} × ${numberFormatter.format(implementationRevenue)} + (${integerFormatter.format(activeClientsNow)} × ${numberFormatter.format(subscriptionRevenue)}) = ${numberFormatter.format(total)}`;
          }
        } else {
          if (revenueModeState === "subscription") {
            const profit = sub - opex;
            tooltip.innerHTML = `Месяц ${integerFormatter.format(month)}<br/>Формула: (активные клиенты × абонплата) − фикс. расходы<br/>Подстановка: (${integerFormatter.format(activeClientsNow)} × ${numberFormatter.format(subscriptionRevenue)}) − ${numberFormatter.format(opex)} = ${numberFormatter.format(profit)}`;
          } else {
            const profit = newClients * implementationProfit + sub - opex;
            tooltip.innerHTML = `Месяц ${integerFormatter.format(month)}<br/>Формула: новые клиенты × прибыль с внедрения + (активные клиенты × абонплата) − фикс. расходы<br/>Подстановка: ${integerFormatter.format(newClients)} × ${numberFormatter.format(implementationProfit)} + (${integerFormatter.format(activeClientsNow)} × ${numberFormatter.format(subscriptionRevenue)}) − ${numberFormatter.format(opex)} = ${numberFormatter.format(profit)}`;
          }
        }
      }
    };
    const onLeave2 = () => {
      focus.style.display = "none";
      if (tooltip) tooltip.style.display = "none";
    };
    rsvg.addEventListener("mousemove", onMove);
    rsvg.addEventListener("mouseleave", onLeave2);
  }

  // Привязываем обработчик к селекту периода внутри карточки (он пересоздаётся при каждом рендере)
  const ltvSelect = document.getElementById("ltvMonths");
  if (ltvSelect) {
    ltvSelect.addEventListener("change", (e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) {
        ltvMonthsState = v;
        calculate();
      }
    });
  }

  // Селект горизонта графика независим от LTV
  const chartSelect = document.getElementById("chartMonths");
  if (chartSelect) {
    chartSelect.addEventListener("change", (e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) {
        chartMonthsState = v;
        calculate();
      }
    });
  }

  // Переключатель режима графика выручки
  const revModeSelect = document.getElementById("revMode");
  if (revModeSelect) {
    revModeSelect.addEventListener("change", (e) => {
      const v = String(e.target.value);
      if (v === "subscription" || v === "total") {
        revenueModeState = v;
        calculate();
      }
    });
  }

  // Переключатель метрики (выручка/прибыль)
  const revMetricSelect = document.getElementById("revMetric");
  if (revMetricSelect) {
    revMetricSelect.addEventListener("change", (e) => {
      const v = String(e.target.value);
      if (v === "revenue" || v === "profit") {
        revMetricState = v;
        calculate();
      }
    });
  }

  // Горизонт графика выручки (12/24)
  const revMonthsSelect = document.getElementById("revMonths");
  if (revMonthsSelect) {
    revMonthsSelect.addEventListener("change", (e) => {
      const v = Number(e.target.value);
      if (v === 12 || v === 24) {
        revenueChartMonthsState = v;
        calculate();
      }
    });
  }

  const implementationSummary = implementationProfit > 0
    ? `Прибыльность внедрения: ${numberFormatter.format(implementationProfit)} с клиента.`
    : `Прибыльность внедрения отрицательная: ${numberFormatter.format(implementationProfit)}.`;

  const implementationNote = Number.isFinite(breakEvenImplementation)
    ? `Для покрытия фиксированных расходов потребуется ${formatClients(breakEvenImplementation)} новых клиентов при текущей прибыльности внедрения.`
    : `Прибыль с внедрения отрицательная или равна нулю, поэтому покрыть расходы за счет внедрений невозможно.`;

  const subscriptionNote = Number.isFinite(breakEvenSubscription)
    ? `Для выхода в ноль по подписочной модели нужно ${formatClients(breakEvenSubscription)} активных клиентов (без учёта задержки из-за пробного периода).`
    : `Подписочная плата не задана, поэтому точка безубыточности по подписке не рассчитывается.`;

  notes.textContent = `${implementationSummary} ${implementationNote} ${subscriptionNote}`;
}

// ---------- Плавающий блок «Входные данные»: липкая панель + выдвижной оверлей ----------
const inputsSectionEl = root.querySelector('#inputsSection');
const inputsGridEl = root.querySelector('#inputs');
const stickyEl = root.querySelector('#inputsSticky');
const stickyBtn = root.querySelector('#inputsStickyToggle');
const drawerEl = root.querySelector('#inputsDrawer');
const drawerContentEl = root.querySelector('#inputsDrawerContent');
const drawerCloseBtn = root.querySelector('#inputsDrawerClose');
const backdropEl = root.querySelector('#inputsBackdrop');
const htmlEl = document.documentElement;
let drawerOpen = false;
let placeholderEl = null;
const originalParent = inputsGridEl.parentElement;

function showSticky(show) {
  if (!stickyEl) return;
  if (show) {
    stickyEl.classList.add('visible');
    stickyEl.setAttribute('aria-hidden', 'false');
  } else {
    stickyEl.classList.remove('visible');
    stickyEl.setAttribute('aria-hidden', 'true');
  }
}

function openDrawer() {
  if (drawerOpen) return;
  drawerOpen = true;
  // Заглушка, чтобы страница не «скакала», когда переносим форму в оверлей
  if (!placeholderEl) {
    placeholderEl = document.createElement('div');
    placeholderEl.className = 'inputs-placeholder';
    const h = inputsSectionEl ? inputsSectionEl.getBoundingClientRect().height : inputsGridEl.getBoundingClientRect().height;
    placeholderEl.style.height = `${Math.max(0, Math.round(h))}px`;
  }
  if (originalParent && placeholderEl.parentNode !== originalParent) {
    originalParent.insertBefore(placeholderEl, inputsGridEl);
  }
  // Переносим существующие поля (с их слушателями) в оверлей
  drawerContentEl.appendChild(inputsGridEl);

  // Отображаем оверлей
  backdropEl.hidden = false;
  drawerEl.hidden = false;
  // форсируем reflow для корректной анимации
  void backdropEl.offsetWidth;
  void drawerEl.offsetWidth;
  backdropEl.classList.add('open');
  drawerEl.classList.add('open');
  showSticky(false);
  if (stickyBtn) stickyBtn.setAttribute('aria-expanded', 'true');
  htmlEl.classList.add('no-scroll');
  // Фокус в первое поле
  inputs.opex && inputs.opex.focus();
}

function closeDrawer() {
  if (!drawerOpen) return;
  drawerOpen = false;
  // Возвращаем форму на место и убираем заглушку
  if (originalParent) {
    originalParent.insertBefore(inputsGridEl, placeholderEl);
  }
  if (placeholderEl && placeholderEl.parentNode) {
    placeholderEl.parentNode.removeChild(placeholderEl);
  }
  placeholderEl = null;

  // Прячем оверлей с анимацией
  backdropEl.classList.remove('open');
  drawerEl.classList.remove('open');
  if (stickyBtn) stickyBtn.setAttribute('aria-expanded', 'false');
  htmlEl.classList.remove('no-scroll');
  window.setTimeout(() => {
    backdropEl.hidden = true;
    drawerEl.hidden = true;
    updateSticky();
  }, 260);
}

function updateSticky() {
  if (!inputsSectionEl) return;
  if (drawerOpen) { showSticky(false); return; }
  const rect = inputsSectionEl.getBoundingClientRect();
  // Показываем панель, когда секция полностью ушла вверх
  const shouldShow = rect.bottom <= 0;
  showSticky(shouldShow);
}

// Наблюдение за видимостью секции
if (window.IntersectionObserver && inputsSectionEl) {
  const io = new IntersectionObserver((entries) => {
    const e = entries[0];
    // Когда секция не видна в вьюпорте, показываем панель
    const visible = e.isIntersecting && e.intersectionRatio > 0;
    showSticky(!visible && !drawerOpen);
  }, { threshold: [0, 0.01, 0.99, 1] });
  io.observe(inputsSectionEl);
} else {
  // Фолбэк: слушаем скролл/ресайз с rAF‑троттлингом
  let ticking = false;
  const onScroll = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => { updateSticky(); ticking = false; });
      ticking = true;
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => updateSticky());
  updateSticky();
}

// Клики и управление
stickyBtn && stickyBtn.addEventListener('click', openDrawer);
drawerCloseBtn && drawerCloseBtn.addEventListener('click', closeDrawer);
backdropEl && backdropEl.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});

Object.values(inputs).forEach((input) => {
  input.addEventListener("input", calculate);
  input.addEventListener("change", calculate);
});

calculate();
