Shader "SniperRidge/VehicleSurface"
{
 Properties
 {
  _Color("Base coat", Color)=(.08,.12,.17,1)
  _Metallic("Metallic",Range(0,1))=.35
  _Glossiness("Smoothness",Range(0,1))=.8
  _BumpMap("Micro surface normal",2D)="bump"{}
  _SurfaceMap("R: metal variation G: roughness B: AO",2D)="white"{}
  _BumpScale("Micro normal strength",Range(0,1))=.12
  _Weather("Road dust",Range(0,1))=.12
  _Destroyed("Burned wreck",Range(0,1))=0
  _Damage("Accumulated damage",Range(0,1))=0
  _Hit0("Impact 1",Vector)=(0,0,0,0)
  _Hit1("Impact 2",Vector)=(0,0,0,0)
  _Hit2("Impact 3",Vector)=(0,0,0,0)
  _Hit3("Impact 4",Vector)=(0,0,0,0)
  _Hit4("Impact 5",Vector)=(0,0,0,0)
  _EmissionColor("Lamp emission",Color)=(0,0,0,1)
 }
 SubShader
 {
  Tags {"RenderType"="Opaque" "DisableBatching"="True"}
  LOD 300
  CGPROGRAM
  #pragma surface surf Standard fullforwardshadows addshadow vertex:vert
  #pragma target 3.0
  sampler2D _BumpMap,_SurfaceMap;
  fixed4 _Color,_EmissionColor;half _Metallic,_Glossiness,_Weather,_Destroyed,_BumpScale,_Damage;
  float4 _Hit0,_Hit1,_Hit2,_Hit3,_Hit4;
  float impact(float3 p,float4 hit){return step(.01,hit.w)*pow(saturate(1-distance(p,hit.xyz)/max(.01,hit.w)),.65);}
  struct Input {float2 uv_BumpMap;float2 uv_SurfaceMap;float3 localPos;};
  void vert(inout appdata_full v,out Input o){UNITY_INITIALIZE_OUTPUT(Input,o);o.localPos=v.vertex.xyz;}
  void surf(Input IN,inout SurfaceOutputStandard o)
  {
   half3 mask=tex2D(_SurfaceMap,IN.uv_SurfaceMap*3).rgb;
   half lower=1-smoothstep(.25,1.25,IN.localPos.y);
   half dust=saturate(_Weather*lower*(.45+mask.g));
   half3 baseColor=_Color.rgb*(.96+.04*mask.r);
   o.Albedo=lerp(baseColor,half3(.24,.20,.145),dust);
   half dent=max(max(impact(IN.localPos,_Hit0),impact(IN.localPos,_Hit1)),max(impact(IN.localPos,_Hit2),max(impact(IN.localPos,_Hit3),impact(IN.localPos,_Hit4))));
   half scratches=smoothstep(.56,.80,sin(dot(IN.localPos,float3(63,37,71)))+mask.r*.3);
   o.Albedo=lerp(o.Albedo,half3(.19,.18,.16),dent*(.35+.6*scratches));
   o.Albedo=lerp(o.Albedo,half3(.023,.019,.017)*(.7+.4*mask.g),_Destroyed);
   half3 normal=UnpackNormal(tex2D(_BumpMap,IN.uv_BumpMap*4));
   o.Normal=normalize(lerp(half3(0,0,1),normal,_BumpScale));
   o.Metallic=_Metallic*(.9+.1*mask.r)*(1-dust)*(1-_Destroyed);
   o.Smoothness=lerp(_Glossiness*(.96+.04*(1-mask.g)),.13,saturate(dust+_Destroyed+dent*.8));
   o.Occlusion=lerp(.92,1,mask.b);o.Emission=_EmissionColor.rgb*(1-_Destroyed);o.Alpha=1;
  }
  ENDCG
 }
 FallBack "Standard"
}
