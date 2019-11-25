import { Injectable } from '@angular/core';

import { Service1 } from './service1';

@Injectable()
export class Service2 extends Service1 {

    public name = 'Service2';

    constructor() {
        super();
        console.log('ctor service2');
    }
}
