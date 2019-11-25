import { Injectable } from '@angular/core';

@Injectable()
export class Service1 {

    public name = 'Service1';

    constructor() {
        console.log('ctor service1');
    }
}
