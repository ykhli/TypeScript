// @target: ES6

for (let x = 0; x < 1; ++x) {
    let x;
    (function() { return x });
    {
        let x;
        (function() { return x });
    }

    try { }
    catch (e) {
        let x;
        (function() { return x });
    }

    switch (x) {
        case 1:
            let x;
            (function() { return x });
           break;
    }
    
    while (1 == 1) {
        let x;
        (function() { return x });
    }
    
    class A {
        m() {
            return x + 1;
        }
    }
}

var data: any = [];
for (let x = 0; x < 10; ++x) {
    class C {
        m() {
            return x + 1;
        }
    }
    data.push(() => C);
}

var data = [];
for (let x = 0; x < 2; ++x) {
    class C { }
    data.push(() => C);
}
