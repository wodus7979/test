Shader "SniperRidge/VehicleGlass"
{
 Properties {_Color("Tint",Color)=(.12,.19,.21,.3) _Glossiness("Smoothness",Range(0,1))=.96 _Destroyed("Broken burned glass",Range(0,1))=0}
 SubShader
 {
  Tags {"Queue"="Transparent" "RenderType"="Transparent" "DisableBatching"="True"}
  LOD 250
  CGPROGRAM
  #pragma surface surf Standard alpha:premul fullforwardshadows
  #pragma target 3.0
  fixed4 _Color;half _Glossiness,_Destroyed;
  struct Input {float3 viewDir;};
  void surf(Input IN,inout SurfaceOutputStandard o)
  {
   o.Albedo=lerp(_Color.rgb,half3(.025,.028,.029),_Destroyed);
   o.Metallic=0;o.Smoothness=lerp(_Glossiness,.15,_Destroyed);
   o.Alpha=lerp(_Color.a+pow(1-saturate(normalize(IN.viewDir).z),5)*.24,.95,_Destroyed);
  }
  ENDCG
 }
 FallBack "Standard"
}
