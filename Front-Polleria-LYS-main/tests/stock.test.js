import {test,expect} from 'vitest';
import {stockLimit} from '../src/utils/stock';
const whole={id:1,stock:1,inventoryId:'pollo',inventoryScale:8,inventoryAvailable:1,inventoryConsumption:8};
const half={...whole,id:2,stock:2,inventoryConsumption:4};
test('mezclar fracciones comparte el límite del carrito',()=>{
 expect(stockLimit(whole,{2:1},[whole,half])).toBe(0);
 expect(stockLimit(half,{1:1},[whole,half])).toBe(0);
 expect(stockLimit(half,{2:1},[whole,half])).toBe(2);
});
test('editar una comanda acredita solo lo previamente reservado',()=>{
 expect(stockLimit(whole,{2:1},[whole,half],{1:1})).toBe(1);
 expect(stockLimit(half,{1:1},[whole,half],{1:1})).toBe(2);
});
test('un producto sin saldo del servidor no recibe un stock ficticio',()=>{
 expect(stockLimit({id:999},{},[])).toBe(0);
 expect(stockLimit({id:999,stock:7},{},[])).toBe(7);
});
