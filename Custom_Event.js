const datalist = 'class_room_Adel_2'

const ix = 0
const iy = 1
const iz = 2

function DataListGetAsync(name){
	return new Promise (function (done, cancel) {
		const dataList_object = {
			name: name,
		};
		DataList.get(dataList_object, dataList_callback);
		function dataList_callback (error, result) {
			if (error) {
				return cancel(error);
			}
			done(result);
		}
	});
}

function DataListAddAsync(name, value){
	return new Promise (function (done, cancel) {
		const dataList_object = {
			name: name,
			value: value,
			insertAt: 'tail'
		};
		DataList.add(dataList_object, dataList_callback);
		function dataList_callback (error, result) {
			if (error) {
				return cancel(error);
			}
			done(result);
		}
	});
}

function DataListGet(name){
	const dataList_object = {
		name: name,
	};
	DataList.get(dataList_object, dataList_callback);
	function dataList_callback (error, result) {
		if (error) {
			event.error(error);
		}
		// console.log(result);
	}
}

function DataListUpdate(name, value, index){
  const dataList_object = {
    name: name,
    value: value,
    index: index
  };
  
  DataList.update(dataList_object, dataList_callback);
  function dataList_callback (error, result) {
    if (error) {
      event.error(error);
    }
    // console.log(result);
  }
}

// Get reading from sensor
reading = Sensor.reading

// Get data from datalist
DataListGetAsync(datalist)
.then(data=>{
  a = Array.from(data['result'])
  
  // Get old test data and convert to 2d array
  a[0] = test_data_to_2darray(a[0])
  
  // Get new test record
  new_record = arrange_record(
    a[2].split(','), reading).map(a=>to_float(a))
    
  // Add new test record to old test data
  a[0] = a[0].concat([new_record])
  
  // Get time_window from datalist
  // and Filter test data based on time_window (get the latest records only)
  time_window = parseFloat(a[3])
  a[0] = filter_by_time(a[0], time_window)
  
  // Update new time-filtered test data in datalist
  DataListUpdate(datalist, a[0], 0)
  
  // Get phone_id from datalist
  // and Filter test data based on phone_id (get the current phone records only)
  phone_id = arrange_record(a[2].split(','), reading)[1]
  a[0] = arrange_test_data(
    a[2].split(','), filter_by_user(a[0], ''.concat(phone_id)))
    
  // Get offline train data from datalist and convert to 2d array
  a[1] = train_data_to_2dArray(a[1], a[2].split(',').length)
  
  // Apply WKNN (Weighted K-Nearest Neighbours) classifier
  // to predict Z (floor number)
  a[6] = KNN_z(a[0], a[1], parseInt(a[4]), parseFloat(a[5]))
  
  // Use Z to filter offline data and get the data in the same Z (same floor)
  // and apply WKNN (Weighted K-Nearest Neighbours) regressor to predict X & Y
  xy = KNN_xy(a[0], a[1], parseInt(a[4]), parseFloat(a[5]), a[6])
  a[7] = xy[0]
  a[8] = xy[1]
  
  // Save predicted Z, X, Y in datalist
  DataListUpdate(datalist, a[6], 6)
  DataListUpdate(datalist, a[7], 7)
  DataListUpdate(datalist, a[8], 8)
})
.then(()=>{event.end()})
.catch((error)=>{event.error(error)});

function test_data_to_2darray(str){
  test_data = []
  lst = str.split(',')
  n = lst.length
  for(let i=0; i<n; i+=4){
    test_data.push(to_float(lst.slice(i, i+4)))
  }
  return test_data
}

function train_data_to_2dArray(s, n_beacons){
  flat = s.split(',').map(a=>parseFloat(a))
  n_col = n_beacons+3
  n_row = flat.length/n_col
  data=[]
  for(let i=0; i<n_row; i++){
    data.push(flat.slice(i*n_col, (i+1)*n_col))
  }
  return data
}

// Convert sensor json record into array
function arrange_record(uuids, record_json){
  new_record = [
    parseInt(new Date().getTime()/1000),
    record_json['phone_id'],
    record_json['UUID'],
    record_json['RSSI']
    ]
  return new_record
}

// Apply moving average filter on test data to get one averaged record
function arrange_test_data(uuids, ndarray){
  record = []
  for(u of uuids){
    filtered = ndarray.filter(row=>row[2] == u).map(row=>parseFloat(row[3]))
    if(filtered.length == 0){
      record.push(-99)
    }else{
      record.push(get_mean(filtered))
    }
  }
  return record
}

function filter_by_time(ndarray, time_window){
  var startTimestamp = parseInt(new Date().getTime()/1000) - time_window
  return ndarray.filter(row=>parseFloat(row[0])>startTimestamp)
}

function filter_by_user(ndarray, phone_id){
  return ndarray.filter(row=>''.concat(row[1]) == ''.concat(phone_id))
}

function get_mean(arr){
    return  arr.reduce((acc, curr)=>{
      return acc + curr}, 0) / arr.length;}

function to_float(lst){
  lst = [].concat(lst)
  return lst.map(a=>{
    if (typeof a === 'string'){
      return a
    }else{
      return parseFloat(a)
    }
  })
}

function euclidean_distance(reading, data_point, decay){
  distance = 0.0
  n = reading.length
  data_point = data_point.slice(3)
  for (let i=0 ; i< n ; i++){
    d =  Math.abs(((100/reading[i])**decay - (100/data_point[i])**decay))
    distance+=d
      // distance = (distance)**.5
  }
  // console.log(distance)
  return distance
}

function KNN_z(reading, data, k, decay){
  var neighbours = data.map(
    row => [euclidean_distance(reading, row, decay), row[0], row[1], row[2]])
  .sort((a, b) => a[0]-b[0]).slice(0, k);

  var z_sum = 0
  var votes = {0:0}
  
  for (i of neighbours){
    votes = w_vote(i[3], i[0], votes)
  }
  
  result_z = Object.keys(votes).reduce((a, b) => votes[a] > votes[b] ? a : b);
  
  console.log('Z = '.concat(result_z))
  return result_z
}

function w_vote(z, w, votes){
  if (z in votes){
    votes[z]+=w
  }else{
    votes[z]=w
  }
  return votes
}

function KNN_xy(reading, data, k, decay, z) {
  data = data.filter(row=>row[2] == z)
  var neighbours = data.map(
    row => [euclidean_distance(reading, row, decay), row[0], row[1], row[2]])
  .sort((a, b) => a[0]-b[0]).slice(0, k);
  
  // console.log(neighbours)
  var x_sum = 0
  var y_sum = 0
  var w_sum = 0
  for (i of neighbours){
    x_sum+=i[1]/i[0]
    y_sum+=i[2]/i[0]
    w_sum+=1/i[0]
  }
  result_x = x_sum/w_sum
  result_y = y_sum/w_sum
  return [result_x, result_y]
}


// function get_neighbours(train, test_point, num_neighbours){
//     distances = []
//     for (let i=0 ; i< point1.length ; i++){
//         dist = euclidean_distance(test_point, train[i])
//         distances.push([train[i], dist])
//         }
//     distances.sort(function(a,b){return a[1] - b[1];})
//     neighbours = []
//     for (let i=0 ; i < num_neighbours.length ; i++){
//         neighbours.append(distances[i])
//         }
//     return neighbours
// }


// GetCachedApplication(appId, appKey, cachedApplication_callback);

// event.log(eucDistance(x,b[1]));

// const query='SELECT * FROM `APPLICATION_89`';

// function searchIn_callback(e, r) {

//   console.log('abc');

//   if (e) {
//     return event.error(e);

//   }

//   event.log(JSON.stringify(r));

// }

// SearchIn(query, searchIn_callback);
//       const opt = {
//         "Source": "System", // Could be EventId
//         "State": "1", // 1 for active, 0 for inactive
//         "Latitude": "31.12", // optional
//         "Longitude": "30.89", // optional
//         "Severity": "0", // from 0 to 3 ,0 very important, 3 least important
//         "Type": "Technical", // Could be DataMissing
//         "Description": "Temperature is very high",
//         "AttentionTo": "GroupName_SiteStaff", // Handler group name
//         "SiteName": "Cairo", // Alarm location
//         "Impact": "101", // SensorId
//         "SensorName": "Temperature Sensor"
//       };
//       function alarm_callback (err, response) {
//         if (err) {
//           return event.error(err);
//         }
//         // write your code here
//         event.end();
//       }
//       FireAlarm(opt, alarm_callback);
