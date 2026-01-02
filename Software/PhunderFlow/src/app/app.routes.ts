import { Routes } from '@angular/router';
import { HomeComponent } from '../app/home/home.component';
import { DeviceEditor } from './device-editor/device-editor';

export const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'editor', component: DeviceEditor}
];