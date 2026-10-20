-- Estado "parcial" para sincronizaciones: algunas cuentas cargaron y otras fallaron.
-- Antes una corrida con 13 de 14 cuentas bien quedaba en "error".
--
-- Va sola en su archivo: ALTER TYPE ... ADD VALUE no puede convivir, en la misma
-- transacción, con sentencias que usen el valor nuevo.
alter type estado_sync add value if not exists 'parcial';
