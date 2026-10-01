let variable_name= "Toias Omollo"
const variable_2= "100"

//Tenary Operators
let result = variable_2 > 50 ? "Greater than 50" : "Less than or equal to 50";

console.log(typeof variable_name);
console.log(typeof variable_2);
console.log(result);

let bank_balance =1000;

const fuliza_limit = 200;

const funcName = function(variable_name){
    const shop_name = variable_name;
    console.log(shop_name)
}

console.log(funcName("Mnyonge"));

const can_fuliza = function(amount) {
    if (amount > fuliza_limit) {
        return "I am sorry, you cannot Fuliza"
    }
    else if (amount <= fuliza_limit || amount == bank_balance) {
        return ""
    }
    else {
        return "You can fuliza"
    }
}

console.log(`Hello Chico, ${can_fuliza(1000)}`)

for (i = 1; i <= 90; i++) {
    if (i % 2 == 0) {
        console.log("Even");
    }
    else {
        console.log("Odd");
    }
}

let run = true;
while (run) {
    for (i= 1; i<= 1000; i++) {
        if (i ==90) {
            console.log(i);
            run = false;
        }
    }
}