#!/bin/bash
# ver.sh toma t1 t2 ... — tira de cuadros de una toma (con el tiempo) + sus marcas
d=${TOMAS:-tomas}/$1; shift
python3 -c "
import json; d=json.load(open('$d/marcas.json')); [print(m['nombre'], m['t'], {k:v for k,v in m.items() if k in ('anim','lie','alPin','cual','pant','pantAnim','esc','golpes','cazan')}) for m in d['marcas']]"
n=$(ls $d/*.jpg | wc -l); ins=""; fil=""; i=0
for t in "$@"; do f=$(printf "%05d.jpg" $(python3 -c "print(min($n-1,round($t*30)))")); ins="$ins -i $d/$f"; fil="$fil[$i]scale=180:-1,drawtext=text='$t':x=5:y=5:fontsize=20:fontcolor=yellow[v$i];"; i=$((i+1)); done
ffmpeg -loglevel error -y $ins -filter_complex "${fil}$(for k in $(seq 0 $((i-1))); do echo -n "[v$k]"; done)hstack=$i" ${SALIDA:-h_ver.png} && echo ok
