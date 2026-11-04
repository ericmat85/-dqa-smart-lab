// Position guidance next to the live control without covering its click target.
export function placeTourPopover({target,bounds,width,height}){
 const gap=12,w=Math.min(width,Math.max(1,bounds.right-bounds.left)),h=Math.min(height,Math.max(1,bounds.bottom-bounds.top));
 const clamp=(v,min,max)=>Math.max(min,Math.min(v,Math.max(min,max)));
 const fit=(left,top,placement)=>({left:clamp(left,bounds.left,bounds.right-w),top:clamp(top,bounds.top,bounds.bottom-h),placement});
 if(!target)return fit(bounds.right-w,bounds.bottom-h,'corner');
 const candidates=[fit(target.right+gap,target.top,'right'),fit(target.left-w-gap,target.top,'left'),fit(target.left,target.bottom+gap,'below'),fit(target.left,target.top-h-gap,'above')];
 const overlap=p=>Math.max(0,Math.min(p.left+w,target.right+6)-Math.max(p.left,target.left-6))*Math.max(0,Math.min(p.top+h,target.bottom+6)-Math.max(p.top,target.top-6));
 return candidates.reduce((best,p)=>overlap(p)<overlap(best)?p:best);
}
