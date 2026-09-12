using UnityEngine;

namespace SniperRidge
{
    public static class FpsWeaponHands
    {
        public static void Attach(Transform weapon)
        {
            var right=new GameObject("Rifle trigger grip").transform;right.SetParent(weapon,false);
            right.localPosition=new Vector3(0f,-.047f,-.172f);right.localRotation=Quaternion.Euler(11,0,0);
            GunnerHands.Build(right,1f);
            var left=new GameObject("Rifle support grip").transform;left.SetParent(weapon,false);
            left.localPosition=new Vector3(0f,-.05f,.175f);left.localRotation=Quaternion.identity;
            GunnerHands.Build(left,-1f);
        }
    }
}
