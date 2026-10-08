export class Notice { constructor(message: string) { console.info(message); } }
export class TFile {}
export class TFolder {}
export class Menu { addItem() {return this;} showAtMouseEvent() {} }
export const Platform={isMobile:false,isDesktopApp:true};
export const normalizePath=(value:string)=>value;
