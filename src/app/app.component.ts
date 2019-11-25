import { Component } from '@angular/core';

import { Service1 } from './service1';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  providers: [Service1]
})
export class AppComponent {
  title = 'angular-transformer';

  constructor(public service: Service1) {

  }
}
